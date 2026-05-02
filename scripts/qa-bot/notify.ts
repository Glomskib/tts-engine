/**
 * QA-bot Telegram notifier.
 *
 * Reads `result.json` next to the SUMMARY.md path, formats a short
 * pass/fail message, and posts it to Brandon's main Telegram chat
 * via the Bot API.
 *
 * Env (read directly — this is a standalone script, not a Next.js route):
 *   TELEGRAM_BOT_TOKEN   (required to send)
 *   TELEGRAM_CHAT_ID     (required to send — the dev chat)
 *   TELEGRAM_LOG_CHAT_ID (optional — falls back to TELEGRAM_CHAT_ID)
 *
 * Usage:
 *   npx tsx scripts/qa-bot/notify.ts \
 *     --summary=/path/to/qa-runs/<ts>/SUMMARY.md \
 *     --target=https://flashflowai.com \
 *     --passed=7 --failed=2
 *
 * The script is fail-safe — if Telegram env vars aren't set, it logs
 * and exits 0 so it never blocks the QA pipeline.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

interface ResultJson {
  target: string;
  timestamp: string;
  host: string;
  passed: number;
  failed: number;
  total: number;
  results: Array<{
    label?: string;
    path: string;
    pass: boolean;
    status: number | null;
    reason: string;
  }>;
}

function getArg(name: string, argv: readonly string[]): string | undefined {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function loadResultJson(summaryPath: string): Promise<ResultJson | null> {
  const dir = path.dirname(summaryPath);
  const jsonPath = path.join(dir, 'result.json');
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(raw) as ResultJson;
  } catch (err) {
    console.warn('[qa-notify] could not read result.json:', err);
    return null;
  }
}

function buildMessage(
  target: string,
  passed: number,
  failed: number,
  total: number,
  failures: ReadonlyArray<{ label?: string; path: string; status: number | null; reason: string }>,
  vaultPath: string,
): string {
  const lines: string[] = [];
  lines.push(`FF QA FAIL — ${failed} of ${total} checks failed`);
  lines.push(`target: ${target}`);
  for (const f of failures.slice(0, 5)) {
    const label = f.label ?? f.path;
    lines.push(`- ${label}: ${f.status ?? '---'} ${f.reason.slice(0, 60)}`);
  }
  if (failures.length > 5) {
    lines.push(`... and ${failures.length - 5} more`);
  }
  lines.push(`report: ${vaultPath}`);
  return lines.join('\n');
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_LOG_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('[qa-notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing — skipping send.');
    console.log('[qa-notify] Message that would have been sent:');
    console.log(text);
    return false;
  }

  // Strip anything that smells like a code dump — keep messages plain.
  const safe = text
    .split('\n')
    .map((l) => l.replace(/```/g, '').replace(/\[[0-9;]*m/g, ''))
    .slice(0, 12) // hard cap, matches lib/telegram.ts spirit
    .join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: safe }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[qa-notify] Telegram send failed:', res.status, body.slice(0, 200));
      return false;
    }
    console.log('[qa-notify] sent.');
    return true;
  } catch (err) {
    console.error('[qa-notify] Telegram send error:', err);
    return false;
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const summaryArg = getArg('summary', argv);
  const targetArg = getArg('target', argv) ?? 'unknown';
  const passedArg = Number(getArg('passed', argv) ?? 0);
  const failedArg = Number(getArg('failed', argv) ?? 0);

  if (!summaryArg) {
    console.error('[qa-notify] --summary=<path> is required');
    return 1;
  }

  const json = await loadResultJson(summaryArg);
  const failures = (json?.results ?? []).filter((r) => !r.pass);
  const total = json?.total ?? passedArg + failedArg;

  // Vault-relative pretty path if it sits inside the vault, else absolute.
  const vaultRoot = `${process.env.HOME ?? ''}/Documents/MacBook Pro VAULT`;
  const pretty = summaryArg.startsWith(vaultRoot)
    ? `vault:${summaryArg.slice(vaultRoot.length)}`
    : summaryArg;

  const text = buildMessage(targetArg, passedArg, failedArg, total, failures, pretty);

  await sendTelegram(text);
  return 0;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[qa-notify] FATAL:', err);
    // Never let notify failures cascade — exit 0.
    process.exit(0);
  });
