/**
 * Throttled Telegram failure alerts.
 *
 * Uses direct Telegram API (not sendTelegramNotification) because
 * the sanitizer blocks structured HTML messages. Tracks cooldowns
 * via ff_cron_runs rows with job='failure_alert:{source}'.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getNodeId } from '@/lib/node-id';

const TAG = '[failure-alert]';

export interface FailureAlertParams {
  source: string;        // e.g. 'ri_ingestion', 'nightly_draft'
  error: string;
  nodeId?: string;
  cooldownMinutes: number;
  context?: Record<string, unknown>;
}

/**
 * Send a failure alert to Telegram if not in cooldown.
 * Records each send as a ff_cron_runs row for cooldown tracking.
 */
export async function checkAndSendFailureAlert(params: FailureAlertParams): Promise<boolean> {
  const { source, error, cooldownMinutes, context } = params;
  const nodeId = params.nodeId ?? getNodeId();
  const cooldownJob = `failure_alert:${source}`;

  try {
    // Check cooldown: find most recent alert send for this source
    const { data: lastAlerts } = await supabaseAdmin
      .from('ff_cron_runs')
      .select('started_at')
      .eq('job', cooldownJob)
      .eq('status', 'ok')
      .order('started_at', { ascending: false })
      .limit(1);

    if (lastAlerts && lastAlerts.length > 0) {
      const lastSent = new Date(lastAlerts[0].started_at).getTime();
      const cooldownMs = cooldownMinutes * 60 * 1000;
      if (Date.now() - lastSent < cooldownMs) {
        console.log(`${TAG} Cooldown active for ${source} (${cooldownMinutes}min). Skipping alert.`);
        return false;
      }
    }

    // Send alert
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      console.log(`${TAG} Telegram not configured. Would alert: ${source} - ${error}`);
      return false;
    }

    const message = formatAlertMessage(source, error, nodeId, context);
    const sent = await sendTelegramDirect(botToken, chatId, message);

    if (sent) {
      // Record the send for cooldown tracking
      await supabaseAdmin
        .from('ff_cron_runs')
        .insert({
          job: cooldownJob,
          status: 'ok',
          finished_at: new Date().toISOString(),
          meta: { source, error: error.slice(0, 500), node_id: nodeId, ...context },
        })
        .then(({ error: dbErr }) => {
          if (dbErr) console.error(`${TAG} Failed to record alert send:`, dbErr.message);
        });
    }

    return sent;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} checkAndSendFailureAlert error:`, msg);
    return false;
  }
}

function formatAlertMessage(
  source: string,
  error: string,
  nodeId: string,
  context?: Record<string, unknown>,
): string {
  const lines = [
    `<b>Job Failure Alert</b>`,
    `<b>Job:</b> ${escapeHtml(source)}`,
    `<b>Node:</b> ${escapeHtml(nodeId)}`,
    `<b>Error:</b> ${escapeHtml(error.slice(0, 300))}`,
    `<b>Time:</b> ${new Date().toISOString()}`,
  ];

  if (context && Object.keys(context).length > 0) {
    const ctxStr = Object.entries(context)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    lines.push(`<b>Context:</b> ${escapeHtml(ctxStr.slice(0, 200))}`);
  }

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramDirect(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`${TAG} Telegram send failed:`, res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} Telegram send error:`, msg);
    return false;
  }
}
