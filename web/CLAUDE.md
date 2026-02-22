# FlashFlow Web — Claude Code Instructions

## Telegram Bot Safety

**NEVER register a Telegram webhook on the main Bolt bot token.**

Telegram only delivers updates via ONE channel — either webhook OR polling (`getUpdates`).
OpenClaw/Bolt uses long-polling. If a webhook is set on the same bot token, Bolt goes
completely dead for Telegram — it receives zero messages.

- The webhook script (`scripts/telegram-webhook.ts set`) requires the
  `--i-know-this-disables-bolt` flag and will refuse without it.
- Run `npx tsx scripts/telegram-webhook.ts assert-deleted` to verify no webhook is set.
- If you need Telegram-based issue intake, use a **separate bot token** (see `docs/ISSUE_INTAKE.md`).
- **Never** call the Telegram `setWebhook` API directly — always use the guarded script.
