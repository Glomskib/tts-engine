/**
 * Marketing Engine Health Probe
 *
 * GET /api/cron/marketing-health
 * Auth: Bearer CRON_SECRET
 *
 * Checks:
 *   - DB connectivity
 *   - Brand accounts present
 *   - LATE_API_KEY configured
 *   - Pending / failed post counts
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isConfigured } from '@/lib/marketing/late-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: Record<string, boolean> = {};
  const details: Record<string, unknown> = {};

  // 1. DB connectivity
  try {
    const { count, error } = await supabaseAdmin
      .from('marketing_posts')
      .select('id', { count: 'exact', head: true });
    checks.db = !error;
    details.total_posts = count ?? 0;
  } catch {
    checks.db = false;
  }

  // 2. Brand accounts present
  try {
    const { count, error } = await supabaseAdmin
      .from('marketing_brand_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('enabled', true);
    checks.brand_accounts = !error && (count ?? 0) > 0;
    details.brand_accounts = count ?? 0;
  } catch {
    checks.brand_accounts = false;
    details.brand_accounts = 0;
  }

  // 3. LATE_API_KEY configured
  checks.late_api_key = isConfigured();

  // 4. Pending count
  try {
    const { count } = await supabaseAdmin
      .from('marketing_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    details.pending = count ?? 0;
  } catch {
    details.pending = -1;
  }

  // 5. Failed in last 24h
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await supabaseAdmin
      .from('marketing_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('updated_at', since);
    details.failed_24h = count ?? 0;
  } catch {
    details.failed_24h = -1;
  }

  // 6. Last scheduler run
  try {
    const { data } = await supabaseAdmin
      .from('marketing_runs')
      .select('status, started_at, posts_created, posts_failed')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    details.last_run = data || null;
  } catch {
    details.last_run = null;
  }

  const allOk = Object.values(checks).every(Boolean);

  return NextResponse.json({
    ok: allOk,
    checks,
    ...details,
  }, { status: allOk ? 200 : 503 });
}
