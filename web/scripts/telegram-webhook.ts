#!/usr/bin/env tsx
/**
 * Register / unregister / audit the Telegram bot webhook.
 *
 * CRITICAL: Setting a webhook DISABLES OpenClaw/Bolt's Telegram polling.
 * Telegram only delivers updates via ONE channel — either webhook OR polling.
 * If webhook is set, Bolt is dead. The `set` command requires an explicit
 * acknowledgement flag to prevent accidental breakage.
 *
 * Usage:
 *   npx tsx scripts/telegram-webhook.ts info
 *   npx tsx scripts/telegram-webhook.ts assert-deleted          # exit 0 if no webhook, exit 1 if set
 *   npx tsx scripts/telegram-webhook.ts delete                  # restore Bolt
 *   npx tsx scripts/telegram-webhook.ts set --i-know-this-disables-bolt
 *   npx tsx scripts/telegram-webhook.ts set --i-know-this-disables-bolt --base https://flashflowai.com
 *
 * Requires TELEGRAM_BOT_TOKEN in .env.local (or set as env var).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// ── Load env ────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch {
    // .env.local not found
  }
}

loadEnv();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN not set.');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
const action = process.argv[2] || 'info';
const ARGS = process.argv.slice(2);
const BASE = ARGS.includes('--base')
  ? ARGS[ARGS.indexOf('--base') + 1]
  : 'https://flashflowai.com';

function webhookSecret(): string {
  return createHash('sha256').update(`tg-webhook::${TOKEN}`).digest('hex').slice(0, 64);
}

// ── Shared helper: fetch current webhook URL ────────────────────────────────
async function getCurrentWebhookUrl(): Promise<string> {
  const res = await fetch(`${API}/getWebhookInfo`);
  const json = await res.json();
  return json?.result?.url || '';
}

// ── Actions ─────────────────────────────────────────────────────────────────
async function main() {
  switch (action) {
    // ── SET (guarded) ──────────────────────────────────────────────────────
    case 'set': {
      if (!ARGS.includes('--i-know-this-disables-bolt')) {
        console.error('');
        console.error('  REFUSED: "set" requires the --i-know-this-disables-bolt flag.');
        console.error('');
        console.error('  Why: Registering a Telegram webhook DISABLES OpenClaw/Bolt polling.');
        console.error('  Bolt will stop receiving Telegram messages entirely.');
        console.error('  All messages will route to /api/webhooks/telegram (issue intake) instead.');
        console.error('');
        console.error('  If you really need this, run:');
        console.error('    npx tsx scripts/telegram-webhook.ts set --i-know-this-disables-bolt');
        console.error('');
        console.error('  Preferred alternative: use a SEPARATE bot token for issue intake.');
        console.error('  See docs/ISSUE_INTAKE.md for the safe setup guide.');
        console.error('');
        process.exit(1);
      }

      const url = `${BASE}/api/webhooks/telegram`;
      const secret = webhookSecret();

      console.log('');
      console.log('  WARNING: This WILL disable OpenClaw/Bolt for Telegram.');
      console.log('  To restore: npx tsx scripts/telegram-webhook.ts delete');
      console.log('');
      console.log(`  Setting webhook -> ${url}`);
      console.log(`  Secret token:     ${secret.slice(0, 8)}...`);

      const res = await fetch(`${API}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret_token: secret,
          allowed_updates: ['message'],
        }),
      });

      const json = await res.json();
      console.log(json.ok ? '  Webhook set.' : `  Failed: ${JSON.stringify(json)}`);
      console.log('');
      break;
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    case 'delete': {
      console.log('Deleting webhook (restoring Bolt)...');
      const res = await fetch(`${API}/deleteWebhook`, { method: 'POST' });
      const json = await res.json();
      console.log(json.ok ? 'Webhook deleted. Bolt should resume polling.' : `Failed: ${JSON.stringify(json)}`);
      break;
    }

    // ── ASSERT-DELETED (for monitoring / CI) ───────────────────────────────
    case 'assert-deleted': {
      const url = await getCurrentWebhookUrl();
      if (url) {
        console.error(`FAIL: Telegram webhook is SET to: ${url}`);
        console.error('Bolt is NOT receiving Telegram messages.');
        console.error('Run: npx tsx scripts/telegram-webhook.ts delete');
        process.exit(1);
      }
      console.log('OK: No Telegram webhook registered. Bolt is polling normally.');
      process.exit(0);
      break;  // unreachable but keeps TS happy
    }

    // ── INFO (default) ─────────────────────────────────────────────────────
    case 'info':
    default: {
      const res = await fetch(`${API}/getWebhookInfo`);
      const json = await res.json();
      const url = json?.result?.url;
      console.log(JSON.stringify(json, null, 2));
      if (url) {
        console.log('\n  STATUS: Webhook is ACTIVE. Bolt is DISABLED for Telegram.');
        console.log('  Run "npx tsx scripts/telegram-webhook.ts delete" to restore Bolt.\n');
      } else {
        console.log('\n  STATUS: No webhook. Bolt is polling normally.\n');
      }
      break;
    }
  }
}

main();
