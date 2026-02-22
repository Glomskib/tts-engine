/**
 * POST /api/webhooks/telegram
 *
 * Incoming Telegram webhook — receives messages from the bot and
 * creates issue reports via the intake system.
 *
 * Security: verifies X-Telegram-Bot-Api-Secret-Token header against
 * a SHA-256 digest of the bot token (set when registering the webhook).
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

// ── Telegram types (minimal) ────────────────────────────────────────────────
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function getWebhookSecret(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  return createHash('sha256').update(`tg-webhook::${token}`).digest('hex').slice(0, 64);
}

function makeFingerprint(source: string, message: string): string {
  return createHash('sha256')
    .update(`${source}::${message.trim().toLowerCase().slice(0, 500)}`)
    .digest('hex')
    .slice(0, 40);
}

async function replyToChat(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch {
    // best-effort reply
  }
}

// ── POST handler ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // Verify webhook secret
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== getWebhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const msg = update.message;
  if (!msg?.text) {
    // Ignore non-text messages (stickers, photos, etc.)
    return NextResponse.json({ ok: true });
  }

  // Skip bot commands that aren't feedback
  const text = msg.text.trim();
  if (text === '/start') {
    await replyToChat(msg.chat.id, 'Send me any message and it will be logged as a FlashFlow issue report.');
    return NextResponse.json({ ok: true });
  }

  const from = msg.from;
  const reporter = from?.username
    ? `@${from.username}`
    : [from?.first_name, from?.last_name].filter(Boolean).join(' ') || `tg:${msg.chat.id}`;

  const fingerprint = makeFingerprint('telegram', text);

  // Upsert into ff_issue_reports (same pattern as intake endpoint)
  const { data: issue, error } = await supabaseAdmin
    .from('ff_issue_reports')
    .upsert(
      {
        source: 'telegram',
        reporter,
        message_text: text,
        context_json: {
          telegram_chat_id: msg.chat.id,
          telegram_message_id: msg.message_id,
          telegram_user_id: from?.id,
          telegram_username: from?.username,
          telegram_date: msg.date,
        },
        severity: 'unknown',
        status: 'new',
        fingerprint,
      },
      { onConflict: 'fingerprint' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('[telegram-webhook] Issue insert error:', error);
    await replyToChat(msg.chat.id, 'Failed to log your issue. Please try again.');
    return NextResponse.json({ ok: true });
  }

  // Log intake action
  await supabaseAdmin
    .from('ff_issue_actions')
    .insert({
      issue_id: issue.id,
      action_type: 'intake',
      payload_json: { source: 'telegram', reporter, telegram_chat_id: msg.chat.id },
    })
    .then(({ error: e }) => e && console.error('[telegram-webhook] Action log error:', e));

  await replyToChat(
    msg.chat.id,
    `Issue logged (${issue.id.slice(0, 8)}). It will be triaged automatically.`
  );

  return NextResponse.json({ ok: true });
}
