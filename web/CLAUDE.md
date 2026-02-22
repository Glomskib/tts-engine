# FlashFlow Web — Claude Code Instructions

## Telegram Bot Safety

**NEVER enable Telegram webhook on Bolt bot token.
Webhook mode disables OpenClaw polling and breaks Bolt.**

- The webhook script (`scripts/telegram-webhook.ts set`) requires the
  `--i-know-this-disables-bolt` flag and will refuse without it.
- Run `npx tsx scripts/telegram-webhook.ts assert-deleted` to verify no webhook is set.
- Run `npx tsx scripts/check-telegram-health.ts` for a quick health check.
- If you need Telegram-based issue intake, use a **separate bot token** (see `docs/ISSUE_INTAKE.md`).
- **Never** call the Telegram `setWebhook` API directly — always use the guarded script.
