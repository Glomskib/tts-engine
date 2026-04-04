/**
 * Opportunity Alerts — Proactive Early-Warning System
 *
 * Generates alerts when the system detects actionable opportunities:
 *   - ACT_NOW: cluster recommendation is ACT_NOW with strong trend
 *   - VELOCITY_SPIKE: velocity score jumped significantly
 *   - COMMUNITY_MOMENTUM: community wins/views hit threshold
 *
 * Duplicate prevention: max 1 alert per cluster per type per 24h.
 * Rate limiting: max 10 alerts per workspace per hour.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail } from '@/lib/email/resend';
import { sendTelegramLog } from '@/lib/telegram';

// ── Types ───────────────────────────────────────────────────────────

export type AlertType = 'ACT_NOW' | 'VELOCITY_SPIKE' | 'COMMUNITY_MOMENTUM';

export interface ClusterSnapshot {
  id: string;
  workspace_id: string;
  display_name: string;
  recommendation: string;
  trend_score: number;
  earlyness_score: number;
  saturation_score: number;
  velocity_score: number;
  community_wins: number;
  community_total_views: number;
  community_best_hook: string | null;
  signals_24h: number;
  signals_prev_24h: number;
}

interface AlertInsert {
  workspace_id: string;
  trend_cluster_id: string;
  product_name: string;
  alert_type: AlertType;
  recommendation: string;
  earlyness_score: number;
  saturation_score: number;
  velocity_score: number;
  community_wins: number;
  community_views: number;
  best_hook: string | null;
  reason_text: string;
}

// ── Thresholds ──────────────────────────────────────────────────────

const ACT_NOW_MIN_TREND = 40;
const VELOCITY_SPIKE_RATIO = 2.0;      // 2x increase vs previous window
const VELOCITY_SPIKE_MIN_SIGNALS = 3;   // need at least 3 signals in 24h
const COMMUNITY_WINS_THRESHOLD = 2;
const COMMUNITY_VIEWS_THRESHOLD = 50000;

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;   // 24h per cluster per type
const MAX_ALERTS_PER_HOUR = 10;                  // per workspace

// ── Main Entry Point ────────────────────────────────────────────────

/**
 * Evaluate a cluster for all alert types after rescore.
 * Returns the number of alerts created.
 */
export async function evaluateClusterAlerts(cluster: ClusterSnapshot): Promise<number> {
  let alertsCreated = 0;

  // Rate limit check
  const hourlyCount = await getWorkspaceAlertCountLastHour(cluster.workspace_id);
  if (hourlyCount >= MAX_ALERTS_PER_HOUR) {
    return 0;
  }

  // Check each alert type
  const actNow = generateActNowAlert(cluster);
  if (actNow && !(await isDuplicate(cluster.id, 'ACT_NOW'))) {
    if (hourlyCount + alertsCreated < MAX_ALERTS_PER_HOUR) {
      await createAlert(actNow);
      alertsCreated++;
    }
  }

  const spike = generateVelocitySpikeAlert(cluster);
  if (spike && !(await isDuplicate(cluster.id, 'VELOCITY_SPIKE'))) {
    if (hourlyCount + alertsCreated < MAX_ALERTS_PER_HOUR) {
      await createAlert(spike);
      alertsCreated++;
    }
  }

  const momentum = generateCommunityMomentumAlert(cluster);
  if (momentum && !(await isDuplicate(cluster.id, 'COMMUNITY_MOMENTUM'))) {
    if (hourlyCount + alertsCreated < MAX_ALERTS_PER_HOUR) {
      await createAlert(momentum);
      alertsCreated++;
    }
  }

  return alertsCreated;
}

// ── Alert Generators ────────────────────────────────────────────────

function generateActNowAlert(cluster: ClusterSnapshot): AlertInsert | null {
  if (cluster.recommendation !== 'ACT_NOW') return null;
  if (cluster.trend_score < ACT_NOW_MIN_TREND) return null;

  return {
    workspace_id: cluster.workspace_id,
    trend_cluster_id: cluster.id,
    product_name: cluster.display_name,
    alert_type: 'ACT_NOW',
    recommendation: cluster.recommendation,
    earlyness_score: cluster.earlyness_score,
    saturation_score: cluster.saturation_score,
    velocity_score: cluster.velocity_score,
    community_wins: cluster.community_wins,
    community_views: cluster.community_total_views,
    best_hook: cluster.community_best_hook,
    reason_text: `${cluster.display_name} is an ACT_NOW opportunity — early (${cluster.earlyness_score}), low saturation (${cluster.saturation_score}), trending at ${cluster.trend_score}.`,
  };
}

function generateVelocitySpikeAlert(cluster: ClusterSnapshot): AlertInsert | null {
  if (cluster.signals_24h < VELOCITY_SPIKE_MIN_SIGNALS) return null;

  const prev = cluster.signals_prev_24h || 0;
  if (prev === 0 && cluster.signals_24h >= VELOCITY_SPIKE_MIN_SIGNALS) {
    // New burst from zero
    return buildVelocityAlert(cluster, `${cluster.display_name} spiked with ${cluster.signals_24h} new signals in 24h (from zero).`);
  }

  const ratio = cluster.signals_24h / Math.max(prev, 1);
  if (ratio >= VELOCITY_SPIKE_RATIO) {
    return buildVelocityAlert(cluster, `${cluster.display_name} velocity spiked ${ratio.toFixed(1)}x (${prev} → ${cluster.signals_24h} signals in 24h).`);
  }

  return null;
}

function buildVelocityAlert(cluster: ClusterSnapshot, reason: string): AlertInsert {
  return {
    workspace_id: cluster.workspace_id,
    trend_cluster_id: cluster.id,
    product_name: cluster.display_name,
    alert_type: 'VELOCITY_SPIKE',
    recommendation: cluster.recommendation,
    earlyness_score: cluster.earlyness_score,
    saturation_score: cluster.saturation_score,
    velocity_score: cluster.velocity_score,
    community_wins: cluster.community_wins,
    community_views: cluster.community_total_views,
    best_hook: cluster.community_best_hook,
    reason_text: reason,
  };
}

function generateCommunityMomentumAlert(cluster: ClusterSnapshot): AlertInsert | null {
  const wins = cluster.community_wins;
  const views = cluster.community_total_views;

  if (wins < COMMUNITY_WINS_THRESHOLD && views < COMMUNITY_VIEWS_THRESHOLD) {
    return null;
  }

  const parts: string[] = [];
  if (wins >= COMMUNITY_WINS_THRESHOLD) {
    parts.push(`${wins} community wins`);
  }
  if (views >= COMMUNITY_VIEWS_THRESHOLD) {
    parts.push(`${formatViews(views)} total views`);
  }

  return {
    workspace_id: cluster.workspace_id,
    trend_cluster_id: cluster.id,
    product_name: cluster.display_name,
    alert_type: 'COMMUNITY_MOMENTUM',
    recommendation: cluster.recommendation,
    earlyness_score: cluster.earlyness_score,
    saturation_score: cluster.saturation_score,
    velocity_score: cluster.velocity_score,
    community_wins: wins,
    community_views: views,
    best_hook: cluster.community_best_hook,
    reason_text: `${cluster.display_name} has community momentum — ${parts.join(', ')}.`,
  };
}

// ── Persistence + Delivery ──────────────────────────────────────────

async function createAlert(alert: AlertInsert): Promise<void> {
  const { data: row, error } = await supabaseAdmin
    .from('opportunity_alerts')
    .insert(alert)
    .select('id')
    .single();

  if (error) {
    console.error('[alerts] insert failed:', error.message);
    return;
  }

  // Deliver via subscribed channels (non-blocking)
  deliverAlert(alert, row?.id).catch(err => {
    console.error('[alerts] delivery failed (non-fatal):', err instanceof Error ? err.message : err);
  });
}

async function deliverAlert(alert: AlertInsert, alertId?: string): Promise<void> {
  // Get active subscriptions for this workspace
  const { data: subs } = await supabaseAdmin
    .from('alert_subscriptions')
    .select('delivery_method, destination, alert_type')
    .eq('workspace_id', alert.workspace_id)
    .eq('enabled', true);

  if (!subs || subs.length === 0) {
    // Default: send Telegram log if configured
    sendTelegramLog(
      `⚡ ${alert.alert_type}: ${alert.product_name}\n` +
      `Early: ${alert.earlyness_score} | Sat: ${alert.saturation_score} | Vel: ${alert.velocity_score}\n` +
      alert.reason_text
    );
    return;
  }

  for (const sub of subs) {
    // Check alert type match
    if (sub.alert_type !== 'ALL' && sub.alert_type !== alert.alert_type) continue;

    switch (sub.delivery_method) {
      case 'in_app':
        // Already stored in opportunity_alerts table
        break;

      case 'email':
        if (sub.destination) {
          await deliverEmailAlert(alert, sub.destination);
        }
        break;

      case 'webhook':
        if (sub.destination) {
          await deliverWebhookAlert(alert, sub.destination);
        }
        break;
    }
  }
}

// ── Email Delivery ──────────────────────────────────────────────────

async function deliverEmailAlert(alert: AlertInsert, to: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.flashflowai.com';

  const subject = `${alertTypeLabel(alert.alert_type)}: ${alert.product_name}`;

  const hookSection = alert.best_hook
    ? `<div style="margin:16px 0;padding:12px;background:#f0fdf4;border-radius:8px;font-style:italic">"${escapeHtml(alert.best_hook)}"</div>`
    : '';

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#059669;margin-bottom:4px">${alertTypeLabel(alert.alert_type)}</h2>
      <h3 style="margin-top:0">${escapeHtml(alert.product_name)}</h3>

      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr>
          <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb"><strong>Earlyness</strong></td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right">${alert.earlyness_score}/100</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb"><strong>Saturation</strong></td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right">${alert.saturation_score}/100</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb"><strong>Community Wins</strong></td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right">${alert.community_wins}</td>
        </tr>
      </table>

      ${hookSection}

      <p style="color:#6b7280;margin:16px 0">${escapeHtml(alert.reason_text)}</p>

      <a href="${appUrl}/admin/opportunity-feed" style="display:inline-block;padding:12px 24px;background:#059669;color:white;text-decoration:none;border-radius:8px;font-weight:600">
        View Opportunity Feed
      </a>

      <p style="color:#9ca3af;font-size:12px;margin-top:24px">
        Sent by FlashFlow Opportunity Alerts. Manage in Settings.
      </p>
    </div>
  `.trim();

  await sendEmail({ to, subject, html });
}

// ── Webhook Delivery ────────────────────────────────────────────────

async function deliverWebhookAlert(alert: AlertInsert, url: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.flashflowai.com';

  const payload = {
    type: alert.alert_type,
    product: alert.product_name,
    earlyness: alert.earlyness_score,
    saturation: alert.saturation_score,
    velocity: alert.velocity_score,
    community_wins: alert.community_wins,
    community_views: alert.community_views,
    top_hook: alert.best_hook || null,
    reason: alert.reason_text,
    link: `${appUrl}/admin/opportunity-feed`,
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[alerts] webhook ${url} returned ${res.status}`);
    }
  } catch (err) {
    console.error('[alerts] webhook delivery failed:', err instanceof Error ? err.message : err);
  }
}

// ── Dedup + Rate Limiting ───────────────────────────────────────────

async function isDuplicate(clusterId: string, alertType: AlertType): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  const { count } = await supabaseAdmin
    .from('opportunity_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('trend_cluster_id', clusterId)
    .eq('alert_type', alertType)
    .gte('created_at', since);

  return (count ?? 0) > 0;
}

async function getWorkspaceAlertCountLastHour(workspaceId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabaseAdmin
    .from('opportunity_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', since);

  return count ?? 0;
}

// ── Helpers ─────────────────────────────────────────────────────────

function alertTypeLabel(type: AlertType): string {
  switch (type) {
    case 'ACT_NOW': return 'Act Now — Opportunity Detected';
    case 'VELOCITY_SPIKE': return 'Velocity Spike Detected';
    case 'COMMUNITY_MOMENTUM': return 'Community Momentum';
  }
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Public Queries ──────────────────────────────────────────────────

export interface AlertRow {
  id: string;
  trend_cluster_id: string | null;
  product_name: string;
  alert_type: AlertType;
  recommendation: string | null;
  earlyness_score: number;
  saturation_score: number;
  velocity_score: number;
  community_wins: number;
  community_views: number;
  best_hook: string | null;
  reason_text: string;
  created_at: string;
  seen_at: string | null;
  dismissed_at: string | null;
}

export async function getUnseenAlertCount(workspaceId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('opportunity_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('seen_at', null)
    .is('dismissed_at', null);

  return count ?? 0;
}

/**
 * Get cluster IDs that have active (unseen, undismissed) alerts.
 */
export async function getActiveAlertClusterIds(workspaceId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('opportunity_alerts')
    .select('trend_cluster_id')
    .eq('workspace_id', workspaceId)
    .is('dismissed_at', null)
    .not('trend_cluster_id', 'is', null);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.trend_cluster_id) ids.add(row.trend_cluster_id);
  }
  return ids;
}
