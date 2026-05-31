/**
 * POST /api/admin/grant-unlimited
 *
 * Admin-gated. Body: { email?: string, user_id?: string, name_query?: string }
 *
 * Finds the user and applies the SAME unlimited grant the manual SQL flow
 * uses — so the admin button and Brandon's incident-response runbook stay
 * in lockstep:
 *
 *   1. Upsert `user_subscriptions` with plan_id='creator_pro', status='active'.
 *      This is the canonical unlimited tier recognized by both the SQL
 *      `deduct_credit` RPC and `lib/credits.ts:checkCredits()` (after the
 *      2026-05-27 incident fix). 'content_fleet' is ALSO recognized as
 *      unlimited and used by the public Fleet pricing tier — we prefer
 *      creator_pro for admin grants so we don't co-opt the paid Fleet
 *      naming for internal comps.
 *
 *   2. Upsert `user_credits.credits_remaining` to 999_999 so the
 *      `requireCredits` gate also passes (belt-and-suspenders — the
 *      RPC won't deduct on unlimited plans anyway).
 *
 *   3. Return a clean summary of what was applied.
 *
 * Rewritten during the 2026-05-27 audit. Previous version called a
 * non-existent `grant_credits` RPC, set plan_id='fleet' (not recognized),
 * and probed nonexistent `tier`/`unlimited` columns + a `profiles` table
 * that doesn't exist in this schema. None of it ever did anything.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdmin } from '@/lib/isAdmin';
import type { User } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UNLIMITED_PLAN_ID = 'creator_pro';
const UNLIMITED_CREDITS = 999_999;

export async function POST(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdmin(auth.user as unknown as User)) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email: string | undefined = body?.email;
  const userId: string | undefined = body?.user_id;
  const nameQuery: string | undefined = body?.name_query;

  if (!email && !userId && !nameQuery) {
    return NextResponse.json({ error: 'provide email, user_id, or name_query' }, { status: 400 });
  }

  const summary: Record<string, unknown> = {
    requested: { email, user_id: userId, name_query: nameQuery },
    started_at: new Date().toISOString(),
  };

  // ── Find the user ──────────────────────────────────────────────
  let targetUserId: string | null = userId ?? null;
  let targetEmail: string | null = email ?? null;

  if (!targetUserId) {
    try {
      // Supabase admin: list users and match by email or name. Capped at 1000
      // per page — beyond that we'd need pagination, which can wait until
      // FlashFlow has > 1k users.
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const users = data?.users || [];
      let match;
      if (email) {
        match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      } else if (nameQuery) {
        const q = nameQuery.toLowerCase();
        match = users.find((u) => {
          const name = (u.user_metadata?.name || u.user_metadata?.full_name || '') as string;
          return name.toLowerCase().includes(q) ||
                 (u.email || '').toLowerCase().includes(q);
        });
      }
      if (match) {
        targetUserId = match.id;
        targetEmail = match.email || null;
        summary.matched_user = {
          id: match.id,
          email: match.email,
          name: match.user_metadata?.name || match.user_metadata?.full_name || null,
          created_at: match.created_at,
        };
      } else {
        return NextResponse.json({
          error: 'user not found',
          searched: { email, user_id: userId, name_query: nameQuery },
          hint: 'try the exact email or use name_query',
        }, { status: 404 });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: 'lookup failed', detail: msg }, { status: 500 });
    }
  }

  // ── Upsert subscription to the unlimited plan ──────────────────
  try {
    const { error } = await supabaseAdmin
      .from('user_subscriptions')
      .upsert(
        {
          user_id: targetUserId,
          plan_id: UNLIMITED_PLAN_ID,
          status: 'active',
        },
        { onConflict: 'user_id' },
      );
    if (error) {
      summary.subscription_error = error.message;
    } else {
      summary.subscription_set = { plan_id: UNLIMITED_PLAN_ID, status: 'active' };
    }
  } catch (e) {
    summary.subscription_error = e instanceof Error ? e.message : String(e);
  }

  // ── Upsert credits row so the requireCredits gate also passes ──
  // The deduct_credit RPC won't decrement on unlimited plans (post-fix),
  // so this number stays at 999_999. Even if some legacy path decrements
  // it, 999_999 lasts essentially forever.
  try {
    const { error } = await supabaseAdmin
      .from('user_credits')
      .upsert(
        {
          user_id: targetUserId,
          credits_remaining: UNLIMITED_CREDITS,
          free_credits_total: 5,
          free_credits_used: 0,
          credits_used_this_period: 0,
          lifetime_credits_used: 0,
        },
        { onConflict: 'user_id' },
      );
    if (error) {
      summary.credits_error = error.message;
    } else {
      summary.credits_set = UNLIMITED_CREDITS;
    }
  } catch (e) {
    summary.credits_error = e instanceof Error ? e.message : String(e);
  }

  // ── Log a transaction row for auditability (best-effort) ───────
  try {
    await supabaseAdmin.from('credit_transactions').insert({
      user_id: targetUserId,
      type: 'bonus',
      amount: UNLIMITED_CREDITS,
      balance_after: UNLIMITED_CREDITS,
      description: `Admin grant — unlimited (creator_pro) via /api/admin/grant-unlimited by ${auth.user.email ?? auth.user.id}`,
    });
  } catch {
    // Non-fatal — transaction log is nice-to-have for audit, not required.
  }

  summary.target_user_id = targetUserId;
  summary.target_email = targetEmail;
  summary.completed_at = new Date().toISOString();

  // If both writes failed, the grant didn't actually land — caller should know.
  const subscriptionOk = !summary.subscription_error;
  const creditsOk = !summary.credits_error;
  if (!subscriptionOk && !creditsOk) {
    return NextResponse.json({ ok: false, summary }, { status: 500 });
  }
  return NextResponse.json({ ok: true, summary });
}

// GET: list non-admin users so the UI can show who's eligible
export async function GET(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdmin(auth.user as unknown as User)) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const users = (data?.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.name || u.user_metadata?.full_name || null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      role_source: u.app_metadata?.role === 'admin' ? 'admin' : null,
    }));
    // Exclude admins from the "eligible" list
    const adminEmails = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const eligible = users.filter(u => !u.role_source && !adminEmails.includes((u.email || '').toLowerCase()));
    return NextResponse.json({ ok: true, eligible, all_count: users.length, admin_count: users.length - eligible.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'list failed', detail: msg }, { status: 500 });
  }
}
