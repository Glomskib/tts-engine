#!/usr/bin/env tsx
/**
 * Register / unregister the Telegram bot webhook.
 *
 * Usage:
 *   npx tsx scripts/telegram-webhook.ts set
 *   npx tsx scripts/telegram-webhook.ts set --base https://flashflowai.com
 *   npx tsx scripts/telegram-webhook.ts delete
 *   npx tsx scripts/telegram-webhook.ts info
 *
 * Requires TELEGRAM_BOT_TOKEN in .env.local (or set as env var).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

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
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'https://flashflowai.com';

function webhookSecret(): string {
  return createHash('sha256').update(`tg-webhook::${TOKEN}`).digest('hex').slice(0, 64);
}

async function main() {
  if (action === 'set') {
    const url = `${BASE}/api/webhooks/telegram`;
    const secret = webhookSecret();

    console.log(`Setting webhook → ${url}`);
    console.log(`Secret token: ${secret.slice(0, 8)}...`);

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
    console.log(json.ok ? 'Webhook set.' : `Failed: ${JSON.stringify(json)}`);
  } else if (action === 'delete') {
    console.log('Deleting webhook...');
    const res = await fetch(`${API}/deleteWebhook`, { method: 'POST' });
    const json = await res.json();
    console.log(json.ok ? 'Webhook deleted.' : `Failed: ${JSON.stringify(json)}`);
  } else {
    const res = await fetch(`${API}/getWebhookInfo`);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  }
}

main();
