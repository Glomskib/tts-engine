/**
 * POST /api/webhooks/telegram
 *
 * Incoming Telegram webhook — receives messages and routes them:
 *
 * 1. Explicit issue commands (/log, /issue, /bug) → create issue immediately
 * 2. Keyword triggers (bug, error, broken, etc.) → ask for confirmation first
 * 3. Everything else → ignore (let OpenClaw handle it)
 *
 * IMPORTANT: This webhook and OpenClaw polling are MUTUALLY EXCLUSIVE.
 * When this webhook is registered, OpenClaw/Bolt cannot receive messages.
 * Only register this webhook if you want issue-intake-only mode.
 * For normal Bolt behavior, keep the webhook DELETED.
 *
 * Security: verifies X-Telegram-Bot-Api-Secret-Token header against
 * a SHA-256 digest of the bot token (set when registering the webhook).
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createHash } from 'crypto';
import {
  classifyIntent,
  ISSUE_COMMANDS,
  CONFIRMATION_PROMPT,
} from '@/lib/telegram-intent';

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
  reply_to_message?: TelegramMessage;
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

async function replyToChat(chatId: number, text: string, replyToMessageId?: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }),
    });
  } catch {
    // best-effort reply
  }
}

async function createIssue(
  text: string,
  msg: TelegramMessage,
  update: TelegramUpdate,
): Promise<string | null> {
  const from = msg.from;
  const reporter = from?.username
    ? `@${from.username}`
    : [from?.first_name, from?.last_name].filter(Boolean).join(' ') || `tg:${msg.chat.id}`;

  // For /log commands, strip the command prefix to get the actual issue text
  let issueText = text;
  for (const cmd of ISSUE_COMMANDS) {
    if (issueText.toLowerCase().startsWith(cmd)) {
      issueText = issueText.slice(cmd.length).trim();
      break;
    }
  }
  if (!issueText) issueText = text; // fallback to full text if command had no body

  // Derive feedback type from command prefix
  const feedbackType = text.toLowerCase().startsWith('/bug') ? 'bug' : 'other';

  const fingerprint = makeFingerprint('telegram', issueText);

  const { data: issue, error } = await supabaseAdmin
    .from('ff_issue_reports')
    .upsert(
      {
        source: 'telegram',
        reporter,
        message_text: issueText,
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
    return null;
  }

  // Log intake action (fire-and-forget)
  supabaseAdmin
    .from('ff_issue_actions')
    .insert({
      issue_id: issue.id,
      action_type: 'intake',
      payload_json: { source: 'telegram', reporter, telegram_chat_id: msg.chat.id },
    })
    .then(({ error: e }) => e && console.error('[telegram-webhook] Action log error:', e));

  // Mirror into ff_feedback_items for Command Center inbox (fire-and-forget)
  const title = issueText.length > 200 ? issueText.slice(0, 197) + '...' : issueText;
  void supabaseAdmin
    .from('ff_feedback_items')
    .insert({
      source: 'telegram' as const,
      type: feedbackType,
      title,
      description: issueText,
      page: null,
      device: null,
      reporter_email: null,
      reporter_user_id: null,
      status: 'new',
      priority: 3,
      raw_json: update,
    })
    .then(({ error: e }) =>
      e && console.error('[telegram-webhook] ff_feedback_items insert error:', e)
    );

  return issue.id;
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
    return NextResponse.json({ ok: true });
  }

  const text = msg.text.trim();

  // /start — show help
  if (text === '/start' || text === '/help') {
    await replyToChat(
      msg.chat.id,
      [
        '<b>FlashFlow Issue Bot</b>',
        '',
        'Commands:',
        '/log &lt;description&gt; — Log an issue',
        '/issue &lt;description&gt; — Log an issue',
        '/bug &lt;description&gt; — Log a bug',
        '',
        'Or just describe a bug/error and I\'ll ask if you want to log it.',
      ].join('\n')
    );
    return NextResponse.json({ ok: true });
  }

  // Classify intent
  const isReply = !!msg.reply_to_message;
  const replyText = msg.reply_to_message?.text;
  const intent = classifyIntent(text, isReply, replyText);

  switch (intent) {
    case 'explicit_issue':
    case 'confirm_yes': {
      // For confirm_yes, the actual issue text is in the message they replied to
      const issueText = intent === 'confirm_yes' && msg.reply_to_message?.reply_to_message?.text
        ? msg.reply_to_message.reply_to_message.text
        : text;

      const issueId = await createIssue(issueText, msg, update);
      if (issueId) {
        await replyToChat(
          msg.chat.id,
          `Issue logged (<code>${issueId.slice(0, 8)}</code>). It will be triaged automatically.`
        );
      } else {
        await replyToChat(msg.chat.id, 'Failed to log issue. Please try again.');
      }
      break;
    }

    case 'maybe_issue': {
      // Ask for confirmation — don't auto-log
      await replyToChat(
        msg.chat.id,
        `${CONFIRMATION_PROMPT} Reply <b>YES</b> to confirm.`,
        msg.message_id
      );
      break;
    }

    case 'normal':
    default:
      // Don't respond — this is a normal message, not an issue.
      // If the webhook is active, this means OpenClaw won't see it either.
      // That's why the webhook should only be registered for issue-intake-only mode.
      break;
  }

  return NextResponse.json({ ok: true });
}
