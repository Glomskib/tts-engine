/**
 * Telegram notification helper.
 * Sends messages to a configured Telegram chat via Bot API.
 * Fail-safe: logs errors but never throws.
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramNotification(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
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
