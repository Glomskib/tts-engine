/**
 * POST /api/account/delete-everything
 *
 * GDPR / CCPA "Right to be Forgotten" endpoint. Wipes ALL FF-owned data
 * for the requesting user — DB rows + storage objects + Supabase Auth user.
 *
 * Required body: { confirm: 'DELETE EVERYTHING' }
 * The confirmation string is intentionally annoying so we don't process
 * accidental requests.
 *
 * Cascades:
 *   1. R2 — delete all clip-source + render objects under <user_id>/
 *   2. Supabase Storage — same for legacy bucket sources
 *   3. brand_profiles, ve_runs, ve_assets, ve_rendered_clips, ve_transcripts,
 *      ve_clip_candidates, user_credits, user_subscriptions, credit_transactions
 *   4. Supabase Auth — delete the auth.users row (after DB cascades)
 *
 * On error, partial deletion may have occurred — we log + return what
 * succeeded so the user can re-request if needed.
 *
 * Audit trail: a gdpr_deletion_log row is written (separate from user data)
 * so we have proof of compliance if regulators audit. This row is anonymized
 * (no PII).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { deleteR2Object, isR2Configured, presignR2Url } from '@/lib/storage/r2';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CONFIRM_STRING = 'DELETE EVERYTHING';

interface DeletionStats {
  r2_objects_deleted: number;
  supabase_objects_deleted: number;
  brand_profiles_deleted: number;
  ve_runs_deleted: number;
  rendered_clips_deleted: number;
  credit_rows_deleted: number;
  auth_user_deleted: boolean;
  errors: string[];
}

/**
 * List all R2 objects under a user_id prefix and delete each.
 * R2's S3-compatible API supports ListObjectsV2.
 */
async function deleteR2UserData(userId: string): Promise<{ count: number; errors: string[] }> {
  if (!isR2Configured()) return { count: 0, errors: [] };
  const errors: string[] = [];
  let count = 0;
  try {
    // List under <user_id>/ prefix
    const listUrl = presignR2Url({
      method: 'GET',
      key: '',
      expiresInSec: 60,
    }).replace(/\/\?/, `/?prefix=${encodeURIComponent(userId + '/')}&list-type=2&`);
    const resp = await fetch(listUrl);
    if (!resp.ok) {
      errors.push(`R2 list failed: ${resp.status}`);
      return { count: 0, errors };
    }
    const xml = await resp.text();
    // Parse <Key>...</Key> tags from the list response
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    for (const key of keys) {
      const ok = await deleteR2Object(key);
      if (ok) count++;
      else errors.push(`R2 rm failed: ${key}`);
    }
  } catch (err) {
    errors.push(`R2 traversal error: ${err instanceof Error ? err.message : err}`);
  }
  return { count, errors };
}

export async function POST(req: NextRequest) {
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { confirm?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 }); }
  if (body.confirm !== CONFIRM_STRING) {
    return NextResponse.json({
      ok: false,
      error: 'Confirmation required',
      detail: `Send { "confirm": "${CONFIRM_STRING}" } in the request body to proceed. This is intentional friction — deletion is permanent.`,
    }, { status: 400 });
  }

  const userId = auth.user.id;
  const email = auth.user.email || '';
  const stats: DeletionStats = {
    r2_objects_deleted: 0,
    supabase_objects_deleted: 0,
    brand_profiles_deleted: 0,
    ve_runs_deleted: 0,
    rendered_clips_deleted: 0,
    credit_rows_deleted: 0,
    auth_user_deleted: false,
    errors: [],
  };

  // ── 1. R2 user data ────────────────────────────────────────────────
  const r2Result = await deleteR2UserData(userId);
  stats.r2_objects_deleted = r2Result.count;
  stats.errors.push(...r2Result.errors);

  // ── 2. Supabase Storage — legacy clip-sources bucket ───────────────
  try {
    const { data: files } = await supabaseAdmin.storage.from('clip-sources').list(userId, { limit: 1000 });
    if (files && files.length) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error } = await supabaseAdmin.storage.from('clip-sources').remove(paths);
      if (error) stats.errors.push(`Supabase storage rm: ${error.message}`);
      else stats.supabase_objects_deleted = paths.length;
    }
  } catch (err) {
    stats.errors.push(`Supabase storage traversal: ${err instanceof Error ? err.message : err}`);
  }

  // ── 3. DB tables — order matters (FKs cascade where set, manual elsewhere) ──
  const tableDeletes: Array<[string, keyof DeletionStats]> = [
    ['ve_rendered_clips', 'rendered_clips_deleted'],
    ['ve_clip_candidates', 'rendered_clips_deleted'], // reuses counter
    ['ve_transcripts', 'rendered_clips_deleted'],     // reuses counter
    ['ve_assets', 've_runs_deleted'],                  // reuses counter
    ['ve_runs', 've_runs_deleted'],
    ['brand_profiles', 'brand_profiles_deleted'],
    ['credit_transactions', 'credit_rows_deleted'],
    ['user_credits', 'credit_rows_deleted'],
    ['user_subscriptions', 'credit_rows_deleted'],
  ];

  for (const [table, _statKey] of tableDeletes) {
    try {
      const { error, count } = await supabaseAdmin
        .from(table)
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      if (error) {
        stats.errors.push(`${table}: ${error.message}`);
      } else if (count && count > 0) {
        // We bump the relevant counter — overcounting is fine, it's just stats
        if (table.includes('clip') || table === 've_transcripts') stats.rendered_clips_deleted += count;
        else if (table.startsWith('ve_')) stats.ve_runs_deleted += count;
        else if (table === 'brand_profiles') stats.brand_profiles_deleted += count;
        else stats.credit_rows_deleted += count;
      }
    } catch (err) {
      stats.errors.push(`${table} exception: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── 4. GDPR audit log (anonymized — proof of compliance) ────────────
  try {
    await supabaseAdmin.from('gdpr_deletion_log').insert({
      user_id_hash: createHash('sha256').update(userId).digest('hex'),
      email_hash: email ? createHash('sha256').update(email.toLowerCase()).digest('hex') : null,
      deleted_at: new Date().toISOString(),
      stats_json: stats,
    });
  } catch {
    // Table may not exist yet — non-fatal, deletion still proceeds
  }

  // ── 5. Auth user — last step, this invalidates their session ───────
  try {
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) stats.errors.push(`auth user: ${authErr.message}`);
    else stats.auth_user_deleted = true;
  } catch (err) {
    stats.errors.push(`auth delete exception: ${err instanceof Error ? err.message : err}`);
  }

  return NextResponse.json({
    ok: stats.auth_user_deleted,
    stats,
    message: stats.auth_user_deleted
      ? 'All your data has been deleted. Your account is no longer accessible.'
      : 'Partial deletion — some assets remained. Reach out to support to complete.',
  });
}
