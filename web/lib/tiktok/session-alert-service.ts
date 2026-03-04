/**
 * TikTok session alert service.
 *
 * Evaluates session health and fires Telegram alerts with DB-backed
 * cooldowns so alerts work across restarts and are node-aware.
 *
 * Cooldowns:
 *   - expiring_soon: 1 alert per 12h
 *   - invalid:       1 alert per 6h
 */

import { supabaseAdmin } from '../supabaseAdmin';
import { sendTelegramNotification } from '../telegram';
import { getNodeId } from '../node-id';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AlertState = 'ok' | 'expiring_soon' | 'invalid';

export interface AlertResult {
  alertState: AlertState;
  alertSent: boolean;
  reason: string;
  expiresInHours: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPIRING_THRESHOLD_HOURS = 6;
const EXPIRING_COOLDOWN_HOURS = 12;
const INVALID_COOLDOWN_HOURS = 6;

// ─── Pure function ──────────────────────────────────────────────────────────

export function computeAlertState(isValid: boolean, expiresInHours: number): AlertState {
  if (!isValid || expiresInHours <= 0) return 'invalid';
  if (expiresInHours <= EXPIRING_THRESHOLD_HOURS) return 'expiring_soon';
  return 'ok';
}

// ─── Main evaluator ─────────────────────────────────────────────────────────

export async function evaluateSessionAlerts(
  nodeId?: string,
  platform = 'tiktok_studio',
): Promise<AlertResult> {
  const node = nodeId || getNodeId();

  // 1. Raw select — NOT getSessionIfWithinTTL (which filters out invalid rows)
  const { data: row, error } = await supabaseAdmin
    .from('ff_session_status')
    .select('*')
    .eq('node_name', node)
    .eq('platform', platform)
    .single();

  if (error || !row) {
    return { alertState: 'ok', alertSent: false, reason: 'no_session_row', expiresInHours: 0 };
  }

  // 2. Compute expiresInHours and alertState
  const diffMs = new Date(row.expires_at).getTime() - Date.now();
  const expiresInHours = Math.max(0, Math.round((diffMs / 3_600_000) * 10) / 10);
  const alertState = computeAlertState(row.is_valid, expiresInHours);

  if (alertState === 'ok') {
    return { alertState, alertSent: false, reason: 'healthy', expiresInHours };
  }

  // 3. Check cooldowns and fire alerts
  if (alertState === 'expiring_soon') {
    return handleExpiring(node, row, expiresInHours);
  }

  return handleInvalid(node, row, expiresInHours);
}

// ─── Alert handlers ─────────────────────────────────────────────────────────

async function handleExpiring(
  nodeId: string,
  row: any,
  expiresInHours: number,
): Promise<AlertResult> {
  const lastAlert = row.last_expiring_alert_at
    ? new Date(row.last_expiring_alert_at)
    : null;

  if (lastAlert && hoursAgo(lastAlert) < EXPIRING_COOLDOWN_HOURS) {
    return { alertState: 'expiring_soon', alertSent: false, reason: 'cooldown_active', expiresInHours };
  }

  const hours = Math.round(expiresInHours * 10) / 10;
  const msg = [
    `\u23F3 TikTok Session Expiring`,
    `Node: ${nodeId} — expires in ${hours}h`,
    `Fix: cd ~/tts-engine/web && npm run tiktok:bootstrap`,
    `Nightly drafts still running.`,
  ].join('\n');

  await sendTelegramNotification(msg);

  await supabaseAdmin
    .from('ff_session_status')
    .update({ last_expiring_alert_at: new Date().toISOString() })
    .eq('node_name', nodeId)
    .eq('platform', row.platform);

  return { alertState: 'expiring_soon', alertSent: true, reason: 'alert_sent', expiresInHours };
}

async function handleInvalid(
  nodeId: string,
  row: any,
  expiresInHours: number,
): Promise<AlertResult> {
  const lastAlert = row.last_invalid_alert_at
    ? new Date(row.last_invalid_alert_at)
    : null;

  if (lastAlert && hoursAgo(lastAlert) < INVALID_COOLDOWN_HOURS) {
    return { alertState: 'invalid', alertSent: false, reason: 'cooldown_active', expiresInHours };
  }

  const msg = [
    `\uD83D\uDD34 TikTok Session Invalid`,
    `Node: ${nodeId} — expired or revoked`,
    `Fix: cd ~/tts-engine/web && npm run tiktok:bootstrap`,
    `Nightly drafts paused until fixed.`,
  ].join('\n');

  await sendTelegramNotification(msg);

  await supabaseAdmin
    .from('ff_session_status')
    .update({ last_invalid_alert_at: new Date().toISOString() })
    .eq('node_name', nodeId)
    .eq('platform', row.platform);

  return { alertState: 'invalid', alertSent: true, reason: 'alert_sent', expiresInHours };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hoursAgo(date: Date): number {
  return (Date.now() - date.getTime()) / 3_600_000;
}
