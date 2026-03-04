/**
 * Revenue Intelligence – Alert Policy
 *
 * Pure-logic module (zero dependencies) that decides whether a Telegram
 * alert should fire after an ingestion run.
 */

export type AlertMode = 'off' | 'urgent' | 'batch' | 'digest' | 'all';

export interface AlertPolicyInput {
  newCount: number;
  urgentCount: number;
  lastAlertSentAt: string | null;
  forceAlert: boolean;
}

export interface AlertPolicyConfig {
  mode: AlertMode;
  batchMin: number;
  digestMinutes: number;
}

export interface AlertPolicyResult {
  shouldSend: boolean;
  reason: string;
}

const VALID_MODES: AlertMode[] = ['off', 'urgent', 'batch', 'digest', 'all'];

/** Evaluate whether an alert should be sent based on policy config. */
export function evaluateAlertPolicy(
  input: AlertPolicyInput,
  config: AlertPolicyConfig,
  now: Date = new Date(),
): AlertPolicyResult {
  // --force-alert overrides everything, even off
  if (input.forceAlert) {
    return { shouldSend: true, reason: 'force-alert flag' };
  }

  if (config.mode === 'off') {
    return { shouldSend: false, reason: 'alert mode is off' };
  }

  if (config.mode === 'urgent') {
    if (input.urgentCount > 0) {
      return { shouldSend: true, reason: `${input.urgentCount} urgent item(s)` };
    }
    return { shouldSend: false, reason: 'no urgent items' };
  }

  if (config.mode === 'batch') {
    if (input.urgentCount > 0) {
      return { shouldSend: true, reason: `${input.urgentCount} urgent item(s)` };
    }
    if (input.newCount >= config.batchMin) {
      return { shouldSend: true, reason: `batch threshold met (${input.newCount} >= ${config.batchMin})` };
    }
    return { shouldSend: false, reason: `below batch threshold (${input.newCount} < ${config.batchMin})` };
  }

  if (config.mode === 'digest') {
    if (input.urgentCount > 0) {
      return { shouldSend: true, reason: `${input.urgentCount} urgent item(s)` };
    }
    if (input.newCount >= config.batchMin) {
      return { shouldSend: true, reason: `batch threshold met (${input.newCount} >= ${config.batchMin})` };
    }
    // Time-window check: fire if enough time has passed and there's any new activity
    if (input.newCount > 0 && input.lastAlertSentAt) {
      const elapsed = now.getTime() - new Date(input.lastAlertSentAt).getTime();
      const windowMs = config.digestMinutes * 60 * 1000;
      if (elapsed >= windowMs) {
        return { shouldSend: true, reason: `digest window elapsed (${Math.round(elapsed / 60000)}min >= ${config.digestMinutes}min)` };
      }
    }
    // First run (null lastAlertSentAt) with new items — send
    if (input.newCount > 0 && input.lastAlertSentAt === null) {
      return { shouldSend: true, reason: 'first alert (no previous alert recorded)' };
    }
    return { shouldSend: false, reason: 'digest window not elapsed' };
  }

  // mode === 'all'
  if (input.newCount > 0) {
    return { shouldSend: true, reason: `${input.newCount} new item(s)` };
  }
  return { shouldSend: false, reason: 'no new activity' };
}

/** Load alert config from environment variables with defaults. */
export function loadAlertConfigFromEnv(): AlertPolicyConfig {
  const rawMode = process.env.RI_ALERT_MODE ?? 'digest';
  const mode: AlertMode = VALID_MODES.includes(rawMode as AlertMode)
    ? (rawMode as AlertMode)
    : 'digest';

  const batchMin = parseInt(process.env.RI_ALERT_BATCH_MIN ?? '10', 10);
  const digestMinutes = parseInt(process.env.RI_ALERT_DIGEST_MINUTES ?? '120', 10);

  return {
    mode,
    batchMin: Number.isFinite(batchMin) && batchMin > 0 ? batchMin : 10,
    digestMinutes: Number.isFinite(digestMinutes) && digestMinutes > 0 ? digestMinutes : 120,
  };
}
