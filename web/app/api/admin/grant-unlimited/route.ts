/**
 * POST /api/admin/grant-unlimited
 *
 * Admin-gated. Body: { email?: string, user_id?: string, name_query?: string }
 *
 * Finds the user and:
 *   1. Sets their plan to highest tier ('fleet') in user_plans if that table exists
 *   2. Grants 999,999 credits via grant_credits RPC if available
 *   3. Returns a summary of what was applied
 *
 * Defensive: each step is wrapped in try/catch so partial success still helps.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdmin } from '@/lib/isAdmin';
import type { User } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
      // Supabase admin: list users and match by email or name. Limited to first 1000.
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
                 u.email?.toLowerCase().includes(q);
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

  // ── Try to set plan to highest tier (table name may vary) ──────
  const planTables = ['user_plans', 'user_subscriptions', 'subscriptions', 'plans'];
  for (const table of planTables) {
    try {
      const { error } = await supabaseAdmin
        .from(table)
        .upsert({
          user_id: targetUserId,
          plan_id: 'fleet',
          tier: 'fleet',
          status: 'active',
          unlimited: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      if (!error) {
        summary[`${table}_set`] = 'fleet/unlimited';
        break; // success, no need to try other tables
      }
    } catch { /* try next */ }
  }

  // ── Try to grant 999,999 credits via the existing RPC ──────────
  try {
    const { error } = await supabaseAdmin.rpc('grant_credits', {
      p_user_id: targetUserId,
      p_amount: 999999,
      p_description: 'Unlimited grant via /api/admin/grant-unlimited',
    });
    summary.credits_granted = error ? 0 : 999999;
    if (error) summary.credits_error = error.message;
  } catch (e) {
    summary.credits_error = e instanceof Error ? e.message : String(e);
  }

  // ── Update profiles table with unlimited flag if column exists ─
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: targetUserId,
        unlimited_credits: true,
        plan_tier: 'fleet',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    if (!error) summary.profiles_unlimited = true;
    else summary.profiles_error = error.message;
  } catch (e) {
    summary.profiles_error = e instanceof Error ? e.message : String(e);
  }

  summary.target_user_id = targetUserId;
  summary.target_email = targetEmail;
  summary.completed_at = new Date().toISOString();
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
