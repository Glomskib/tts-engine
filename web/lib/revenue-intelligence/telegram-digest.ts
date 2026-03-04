/**
 * Revenue Intelligence – Telegram Digest Alert
 *
 * Sends a formatted digest summary to Telegram after ingestion runs.
 * Uses HTML parse_mode (consistent with lib/telegram.ts and RI telegram.ts).
 */

import type { RevenueModeItem } from './types';

const TAG = '[ri:digest-alert]';

const CATEGORY_EMOJI: Record<string, string> = {
  buying_intent: '\u{1F4B0}',
  objection: '\u{1F914}',
  shipping: '\u{1F4E6}',
  support: '\u{1F6E0}',
  praise: '\u2B50',
  troll: '\u{1F6AB}',
  general: '\u{1F4AC}',
};

export interface DigestAlertPayload {
  username: string;
  newCount: number;
  urgentCount: number;
  topItems: RevenueModeItem[];
  policyReason: string;
}

/** Escape HTML special chars for Telegram HTML parse mode. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Format a score into a label like "lead=82/100". */
function scoreLabel(name: string, value: number): string {
  return `${name}=${value}/100`;
}

/** Pure function — build the digest message string. Exported for testing. */
export function formatDigestMessage(payload: DigestAlertPayload): string {
  const { username, newCount, urgentCount, topItems, policyReason } = payload;

  const lines: string[] = [
    `\u{1F4CA} <b>RI Digest \u2014 @${esc(username)}</b>`,
    `New: ${newCount} | Urgent: ${urgentCount}`,
    `Trigger: ${esc(policyReason)}`,
    '',
  ];

  for (const item of topItems) {
    const emoji = CATEGORY_EMOJI[item.category] ?? '\u{1F4AC}';
    const preview = item.commentText.length > 60
      ? item.commentText.slice(0, 57) + '...'
      : item.commentText;
    lines.push(
      `${emoji} <b>@${esc(item.commenterUsername)}</b> \u2014 ${esc(item.category)} [${item.status ?? 'queued'}]`,
    );
    lines.push(
      `   ${scoreLabel('lead', item.leadScore)}, ${scoreLabel('urgency', item.urgencyScore)}`,
    );
    lines.push(`   "${esc(preview)}"`);
  }

  lines.push('');
  lines.push('\u{1F50D} Review: /admin/revenue-mode');
  lines.push('\u2705 Self-check: /admin/ri/status');

  return lines.join('\n');
}

/** Send a digest alert to Telegram. Returns true on success. */
export async function sendDigestAlert(payload: DigestAlertPayload): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn(`${TAG} Telegram not configured \u2014 skipping digest alert`);
    return false;
  }

  const message = formatDigestMessage(payload);

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`${TAG} Telegram API error:`, data);
      return false;
    }

    console.log(`${TAG} Digest alert sent for @${payload.username}`);
    return true;
  } catch (err) {
    console.error(`${TAG} Digest alert failed:`, err);
    return false;
  }
}
