/**
 * Revenue Intelligence – Telegram Digest Alert
 *
 * Sends a formatted digest summary to Telegram after ingestion runs.
 * Uses direct Telegram API (same pattern as urgency-scoring-service.ts).
 */

import type { RevenueModeItem } from './types';

const TAG = '[ri:digest-alert]';

const CATEGORY_EMOJI: Record<string, string> = {
  buying_intent: '💰',
  objection: '🤔',
  shipping: '📦',
  support: '🛠',
  praise: '⭐',
  troll: '🚫',
  general: '💬',
};

export async function sendDigestAlert({
  username,
  newCount,
  urgentCount,
  topItems,
}: {
  username: string;
  newCount: number;
  urgentCount: number;
  topItems: RevenueModeItem[];
}): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn(`${TAG} Telegram not configured — skipping digest alert`);
    return;
  }

  const lines: string[] = [
    `📊 *RI Digest — @${username}*`,
    `New: ${newCount} | Urgent: ${urgentCount}`,
    '',
  ];

  for (const item of topItems) {
    const emoji = CATEGORY_EMOJI[item.category] ?? '💬';
    const preview = item.commentText.length > 60
      ? item.commentText.slice(0, 57) + '...'
      : item.commentText;
    lines.push(
      `${emoji} @${item.commenterUsername} — ${item.category} — ${item.leadScore}/${item.urgencyScore} — "${preview}"`,
    );
  }

  const message = lines.join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    console.log(`${TAG} Digest alert sent for @${username}`);
  } catch (err) {
    console.error(`${TAG} Digest alert failed:`, err);
  }
}
