/**
 * Telegram notification helper.
 * Sends messages to a configured Telegram chat via Bot API.
 * Fail-safe: logs errors but never throws.
 *
 * Safety features:
 *   - REMINDERS_ENABLED env var gate (default: true)
 *   - Output sanitizer blocks code/tool/ANSI leaks
 *   - Max 5 lines, plain text only
 *   - Optional TELEGRAM_LOG_CHAT_ID routes cron messages to a separate channel
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/** Separate log channel for cron/reminder output. Falls back to main chat. */
const TELEGRAM_LOG_CHAT_ID = process.env.TELEGRAM_LOG_CHAT_ID || TELEGRAM_CHAT_ID;

// ── Sanitizer ──────────────────────────────────────────────

/** Patterns that indicate code/tool/debug content leaked into a message. */
const CODE_LEAK_PATTERNS: RegExp[] = [
  /```/,                         // fenced code blocks
  /\x1b\[/,                      // ANSI escape (raw)
  /\\x1b\[/,                     // ANSI escape (escaped string)
  /\u001b/,                      // ANSI escape (unicode)
  /\\u001b/,                     // ANSI escape (escaped unicode)
  /^import\s+/m,                 // JS/TS import statement
  /^def\s+\w+\s*\(/m,           // Python function def
  /^await\s+/m,                  // bare await at line start
  /session_[a-zA-Z0-9]{8,}/,    // session tokens
  /\btool_use\b/i,              // tool-use markers
  /\bfunction\s+\w+\s*\(/,     // JS function declaration
  /Here['']s the code/i,        // LLM preamble
  /^command:\s/m,               // command: prefix
  /\{\s*"[^"]+"\s*:/,           // JSON object literal
  /^\s*\}\s*$/m,                // lone closing brace on a line
  /\bclass\s+\w+\s*\{/,        // class declaration
  /\bconst\s+\w+\s*=/,         // const assignment
  /\bexport\s+(default\s+)?/,   // export statement
  /\breturn\s+\w/,              // return statement
  /\bconsole\.(log|error|warn)/, // console calls
];

const MAX_LINES = 5;

/**
 * Sanitize a Telegram message before sending.
 * Returns the cleaned string, or null if the message should be dropped.
 */
export function sanitizeTelegramMessage(raw: string): string | null {
  if (!raw || !raw.trim()) return null;

  // Check for code/tool leaks — drop the entire message
  for (const pattern of CODE_LEAK_PATTERNS) {
    if (pattern.test(raw)) {
      console.warn(
        `[telegram] Blocked message — matched code leak pattern: ${pattern.source}`,
        raw.slice(0, 120),
      );
      return null;
    }
  }

  // Strip non-printable characters (keep newlines, tabs, standard unicode)
  let cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Enforce max line count
  const lines = cleaned.split('\n');
  if (lines.length > MAX_LINES) {
    cleaned = lines.slice(0, MAX_LINES).join('\n') + '\n…';
  }

  // Final empty check
  if (!cleaned.trim()) return null;

  return cleaned;
}

// ── Feature flag ───────────────────────────────────────────

function remindersEnabled(): boolean {
  const flag = process.env.REMINDERS_ENABLED;
  // Default to true if not set; only disable on explicit "false" / "0"
  if (!flag) return true;
  return flag !== 'false' && flag !== '0';
}

// ── Sender ─────────────────────────────────────────────────

/**
 * Send a notification to the main dev Telegram chat.
 * Sanitizes content and respects the REMINDERS_ENABLED flag.
 */
export async function sendTelegramNotification(message: string): Promise<void> {
  if (!remindersEnabled()) return;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const safe = sanitizeTelegramMessage(message);
  if (!safe) return;

  await _send(TELEGRAM_CHAT_ID, safe);
}

/**
 * Send a cron/reminder message to the dedicated log channel.
 * Falls back to the main chat if TELEGRAM_LOG_CHAT_ID is not set.
 */
export async function sendTelegramLog(message: string): Promise<void> {
  if (!remindersEnabled()) return;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_LOG_CHAT_ID) return;

  const safe = sanitizeTelegramMessage(message);
  if (!safe) return;

  await _send(TELEGRAM_LOG_CHAT_ID, safe);
}

/** Low-level send (no sanitization — callers must sanitize first). */
async function _send(chatId: string, text: string): Promise<void> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      console.error("[telegram] Failed to send:", res.status, body);
    }
  } catch (err) {
    console.error("[telegram] Error sending notification:", err);
  }
}
