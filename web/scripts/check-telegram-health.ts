#!/usr/bin/env tsx
/**
 * Lightweight cron health check for Telegram/Bolt polling.
 *
 * Calls getWebhookInfo and exits:
 *   0 + "Bolt polling OK"            — no webhook, Bolt is healthy
 *   1 + "Webhook detected — Bolt broken" — webhook is set, Bolt is dead
 *
 * Usage:
 *   npx tsx scripts/check-telegram-health.ts
 *
 * Cron example (every 5 min):
 *   0/5 * * * * cd /path/to/web && npx tsx scripts/check-telegram-health.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Load env ────────────────────────────────────────────────────────────────
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

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN not set.');
  process.exit(1);
}

async function check() {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
  const json = await res.json();
  const url = json?.result?.url || '';

  if (url) {
    console.error(`Webhook detected — Bolt broken`);
    console.error(`  Webhook URL: ${url}`);
    console.error(`  Fix: npx tsx scripts/telegram-webhook.ts delete`);
    process.exit(1);
  }

  console.log('Bolt polling OK');
  process.exit(0);
}

check();
