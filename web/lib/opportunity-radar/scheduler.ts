/**
 * Opportunity Radar — Scan Scheduler
 *
 * Determines which creators are due for scanning, computes the right
 * scan cadence from the highest-entitled watcher, and manages the
 * creator_sources lifecycle.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getScanIntervalHours } from './limits';
import { migrateOldPlanId } from '@/lib/plans';

// ---------------------------------------------------------------------------
// 1. ensureCreatorSource
// ---------------------------------------------------------------------------

/**
 * Find or create a `creator_sources` record for this platform+handle.
 * Uses upsert with ON CONFLICT (platform, handle) DO UPDATE SET updated_at.
 */
export async function ensureCreatorSource(
  platform: string,
  handle: string,
  displayName?: string,
) {
  const { data, error } = await supabaseAdmin
    .from('creator_sources')
    .upsert(
      {
        platform,
        handle,
        ...(displayName ? { display_name: displayName } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'platform,handle' },
    )
    .select('*')
    .single();

  if (error) throw new Error(`ensureCreatorSource failed: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// 2. linkWatchlistToSource
// ---------------------------------------------------------------------------

/**
 * Set `creator_source_id` on a watchlist entry so it points to the shared source.
 */
export async function linkWatchlistToSource(watchlistId: string, sourceId: string) {
  const { error } = await supabaseAdmin
    .from('creator_watchlist')
    .update({ creator_source_id: sourceId })
    .eq('id', watchlistId);

  if (error) throw new Error(`linkWatchlistToSource failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// 3. recalcSourceCadence
// ---------------------------------------------------------------------------

/**
 * Recalculate the optimal scan_interval_hours for a creator_source
 * based on ALL active watchers. The fastest entitled cadence wins.
 */
export async function recalcSourceCadence(sourceId: string) {
  // Get all active watchlist entries pointing at this source
  const { data: watchers, error: wErr } = await supabaseAdmin
    .from('creator_watchlist')
    .select('workspace_id')
    .eq('creator_source_id', sourceId)
    .eq('is_active', true);

  if (wErr) throw new Error(`recalcSourceCadence: watchers query failed: ${wErr.message}`);

  const activeCount = watchers?.length ?? 0;

  if (activeCount === 0) {
    // No active watchers — reset to default and pause
    const { error } = await supabaseAdmin
      .from('creator_sources')
      .update({
        active_watcher_count: 0,
        scan_interval_hours: 24,
        monitoring_status: 'paused',
      })
      .eq('id', sourceId);

    if (error) throw new Error(`recalcSourceCadence: update failed: ${error.message}`);
    return;
  }

  // Deddup workspace IDs
  const workspaceIds = [...new Set(watchers!.map((w) => w.workspace_id))];

  // Look up each workspace's plan
  const { data: subs, error: sErr } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id, plan_id')
    .in('user_id', workspaceIds);

  if (sErr) throw new Error(`recalcSourceCadence: subscriptions query failed: ${sErr.message}`);

  // Build workspace → planId map (default to 'free' if no subscription row)
  const planMap = new Map<string, string>();
  for (const sub of subs ?? []) {
    planMap.set(sub.user_id, migrateOldPlanId(sub.plan_id ?? 'free'));
  }

  // Compute fastest (minimum) scan interval across all watchers
  let minInterval = Infinity;
  for (const wsId of workspaceIds) {
    const planId = planMap.get(wsId) ?? 'free';
    const interval = getScanIntervalHours(planId);
    if (interval < minInterval) minInterval = interval;
  }

  if (!isFinite(minInterval)) minInterval = 24;

  // Get current source to compute next_check_at
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('creator_sources')
    .select('last_checked_at')
    .eq('id', sourceId)
    .single();

  if (srcErr) throw new Error(`recalcSourceCadence: source query failed: ${srcErr.message}`);

  let nextCheckAt: string;
  if (source?.last_checked_at) {
    const lastChecked = new Date(source.last_checked_at);
    nextCheckAt = new Date(lastChecked.getTime() + minInterval * 60 * 60 * 1000).toISOString();
  } else {
    nextCheckAt = new Date().toISOString();
  }

  const { error: upErr } = await supabaseAdmin
    .from('creator_sources')
    .update({
      scan_interval_hours: minInterval,
      active_watcher_count: activeCount,
      next_check_at: nextCheckAt,
      monitoring_status: 'active',
    })
    .eq('id', sourceId);

  if (upErr) throw new Error(`recalcSourceCadence: final update failed: ${upErr.message}`);
}

// ---------------------------------------------------------------------------
// 4. getDueScans
// ---------------------------------------------------------------------------

/**
 * Query creator_sources that are due for scanning.
 * Returns the most overdue first, limited to batchSize.
 */
export async function getDueScans(batchSize: number = 10) {
  const { data, error } = await supabaseAdmin
    .from('creator_sources')
    .select('*')
    .eq('monitoring_status', 'active')
    .gt('active_watcher_count', 0)
    .or('next_check_at.is.null,next_check_at.lte.' + new Date().toISOString())
    .order('next_check_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (error) throw new Error(`getDueScans failed: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// 5. logScanResult
// ---------------------------------------------------------------------------

/**
 * Record a scan result in the audit log and update the source's state.
 */
export async function logScanResult(
  sourceId: string,
  result: {
    status: string;
    scan_mode?: string;
    changed?: boolean;
    fingerprint?: string | null;
    products_found?: number;
    new_observations?: number;
    observations_updated?: number;
    duration_ms?: number;
    error_message?: string;
  },
) {
  // Insert audit log entry
  const { error: logErr } = await supabaseAdmin
    .from('creator_scan_log')
    .insert({
      creator_source_id: sourceId,
      status: result.status,
      scan_mode: result.scan_mode ?? 'full_fetch',
      changed: result.changed ?? null,
      fingerprint: result.fingerprint ?? null,
      products_found: result.products_found ?? 0,
      new_observations: result.new_observations ?? 0,
      observations_updated: result.observations_updated ?? 0,
      duration_ms: result.duration_ms ?? null,
      error_message: result.error_message ?? null,
    });

  if (logErr) throw new Error(`logScanResult: log insert failed: ${logErr.message}`);

  // Get current source state
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('creator_sources')
    .select('check_count, scan_interval_hours')
    .eq('id', sourceId)
    .single();

  if (srcErr) throw new Error(`logScanResult: source query failed: ${srcErr.message}`);

  const now = new Date();
  const intervalHours = source?.scan_interval_hours ?? 24;
  const nextCheckAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000).toISOString();
  const newCheckCount = (source?.check_count ?? 0) + 1;

  // Determine if we should flag monitoring_status as error
  // (10+ consecutive errors — check last 10 logs)
  let monitoringStatus: string | undefined;
  if (result.status === 'error') {
    const { data: recentLogs } = await supabaseAdmin
      .from('creator_scan_log')
      .select('status')
      .eq('creator_source_id', sourceId)
      .order('created_at', { ascending: false })
      .limit(10);

    const allErrors = recentLogs && recentLogs.length >= 10 &&
      recentLogs.every((log) => log.status === 'error');
    if (allErrors) {
      monitoringStatus = 'error';
    }
  }

  const isFullFetch = result.scan_mode === 'full_fetch' || !result.scan_mode;
  const sourceUpdate: Record<string, unknown> = {
    last_checked_at: now.toISOString(),
    last_check_status: result.status,
    check_count: newCheckCount,
    last_check_error: result.error_message || null,
    next_check_at: nextCheckAt,
    ...(monitoringStatus ? { monitoring_status: monitoringStatus } : {}),
  };

  // Track full fetch count
  if (isFullFetch) {
    sourceUpdate.last_full_fetch_at = now.toISOString();
  }

  // Update fingerprint if provided
  if (result.fingerprint) {
    sourceUpdate.last_source_fingerprint = result.fingerprint;
  }

  const { error: upErr } = await supabaseAdmin
    .from('creator_sources')
    .update(sourceUpdate)
    .eq('id', sourceId);

  if (upErr) throw new Error(`logScanResult: source update failed: ${upErr.message}`);
}

/**
 * Record a probe result. Lighter-weight version of logScanResult
 * for cheap probes that don't run full ingestion.
 */
export async function logProbeResult(
  sourceId: string,
  result: {
    status: string;
    changed: boolean;
    fingerprint: string | null;
    duration_ms: number;
    product_count?: number;
  },
) {
  // Insert probe log entry
  const { error: logErr } = await supabaseAdmin
    .from('creator_scan_log')
    .insert({
      creator_source_id: sourceId,
      status: result.status,
      scan_mode: 'probe',
      changed: result.changed,
      fingerprint: result.fingerprint,
      products_found: result.product_count ?? 0,
      new_observations: 0,
      observations_updated: 0,
      duration_ms: result.duration_ms,
    });

  if (logErr) console.error('logProbeResult: log insert failed:', logErr.message);

  // Get source for counter updates
  const { data: source } = await supabaseAdmin
    .from('creator_sources')
    .select('check_count, scan_interval_hours, consecutive_no_change, total_probes, total_probe_savings')
    .eq('id', sourceId)
    .single();

  const now = new Date();
  const intervalHours = source?.scan_interval_hours ?? 24;
  const nextCheckAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000).toISOString();

  const sourceUpdate: Record<string, unknown> = {
    last_checked_at: now.toISOString(),
    last_check_status: result.status,
    last_probe_at: now.toISOString(),
    last_probe_status: result.changed ? 'changed' : 'unchanged',
    check_count: (source?.check_count ?? 0) + 1,
    total_probes: (source?.total_probes ?? 0) + 1,
    next_check_at: nextCheckAt,
  };

  if (!result.changed) {
    sourceUpdate.consecutive_no_change = (source?.consecutive_no_change ?? 0) + 1;
    sourceUpdate.total_probe_savings = (source?.total_probe_savings ?? 0) + 1;
  } else {
    sourceUpdate.consecutive_no_change = 0;
  }

  if (result.fingerprint) {
    sourceUpdate.last_source_fingerprint = result.fingerprint;
  }

  const { error: upErr } = await supabaseAdmin
    .from('creator_sources')
    .update(sourceUpdate)
    .eq('id', sourceId);

  if (upErr) console.error('logProbeResult: source update failed:', upErr.message);
}

// ---------------------------------------------------------------------------
// 6. getSchedulerStats
// ---------------------------------------------------------------------------

/**
 * Return summary stats for the scan scheduler dashboard.
 */
export async function getSchedulerStats() {
  const now = new Date().toISOString();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  // Run queries in parallel
  const [totalRes, activeRes, dueRes, scansTodayRes, errorsTodayRes, probesTodayRes, fullFetchesTodayRes, savingsRes] = await Promise.all([
    // total_sources
    supabaseAdmin
      .from('creator_sources')
      .select('id', { count: 'exact', head: true }),

    // active_sources
    supabaseAdmin
      .from('creator_sources')
      .select('id', { count: 'exact', head: true })
      .eq('monitoring_status', 'active')
      .gt('active_watcher_count', 0),

    // due_now
    supabaseAdmin
      .from('creator_sources')
      .select('id', { count: 'exact', head: true })
      .eq('monitoring_status', 'active')
      .gt('active_watcher_count', 0)
      .or('next_check_at.is.null,next_check_at.lte.' + now),

    // scans_today (all)
    supabaseAdmin
      .from('creator_scan_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso),

    // errors_today
    supabaseAdmin
      .from('creator_scan_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'error')
      .gte('created_at', todayIso),

    // probes_today
    supabaseAdmin
      .from('creator_scan_log')
      .select('id', { count: 'exact', head: true })
      .eq('scan_mode', 'probe')
      .gte('created_at', todayIso),

    // full_fetches_today
    supabaseAdmin
      .from('creator_scan_log')
      .select('id', { count: 'exact', head: true })
      .eq('scan_mode', 'full_fetch')
      .gte('created_at', todayIso),

    // total_probe_savings (all time, sum across sources)
    supabaseAdmin
      .from('creator_sources')
      .select('total_probe_savings'),
  ]);

  const totalSavings = (savingsRes.data ?? []).reduce(
    (sum, s) => sum + ((s as Record<string, unknown>).total_probe_savings as number || 0), 0
  );

  return {
    total_sources: totalRes.count ?? 0,
    active_sources: activeRes.count ?? 0,
    due_now: dueRes.count ?? 0,
    scans_today: scansTodayRes.count ?? 0,
    errors_today: errorsTodayRes.count ?? 0,
    probes_today: probesTodayRes.count ?? 0,
    full_fetches_today: fullFetchesTodayRes.count ?? 0,
    total_probe_savings: totalSavings,
  };
}
