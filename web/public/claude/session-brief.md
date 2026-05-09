# Session Brief — what's active right now

*Auto-updated by `~/Documents/Command-Center/update-session-brief.command`. Read this AFTER `CLAUDE-BOOTSTRAP.md` to know what to do FIRST in a new chat.*

---

## Last session ended: 2026-05-09 ~10am ET

## TOP BLOCKER — only Brandon can fix

**Vercel deploy pipeline disconnected.** `mc.flashflowai.com/api/health` reports version `7e8c5e8` but `origin/main` is at `(latest)` — pushes aren't building. Until this is fixed, every commit lives on origin/main but doesn't reach prod.

**Fix path (90 seconds):**
1. https://vercel.com/brandons-projects-94dcab35/mission-control
2. Deployments tab → look for failed/cancelled in last 24h
3. OR Settings → Git → confirm "Production Branch: main" + repo connected
4. OR Usage tab → check for "Paused" / "Limit Reached" banner

## Queued for next deploy (will all ship at once when pipe unsticks)

1. Bolt /health command + haiku fallback
2. mmm-customer-service Gmail polling agent (drafts replies, Telegram approve)
3. /mc bookshelf + autonomy layer (heartbeat + auto-decomposer + fleet visualizer)
4. Middleware allowlist (heartbeat + cron public)
5. Telegram-chief syntax fix (the actual unblock)
6. Workspace filter wires through + task comments thread

## Recently fixed

- Supabase 50MB POST cap diagnosed (FF Editor 413). Fix in code = TUS resumable.
- node_modules corruption + telegram-chief apostrophe parse error. Local build passes.
- Bookshelf skeleton built at /mc (6 venture books + spaceship strip).
- Goals.yaml written as source of truth for auto-decomposer.

## Standing initiatives — pick from these when idle

- **HHH 2026 sponsor outreach** — 25 personalized first-touch drafts. Already drafted at `~/Documents/Claude/Projects/Mac Takeover/HHH-2026-SPONSOR-OUTREACH-25.md`. Need: contact discovery (Bolt brief queued at `fleet/queued/2026-05-09-sponsor-contacts-research--mini.md`).
- **HHH FB content next 30 days** — June 8 → July 7. Mini brief queued at `fleet/queued/2026-05-09-hhh-content-60-days--mini.md`.
- **Monday-style MC Phase 1 remaining** — 8-col table view at /admin/board, colored pills, inline edit, grouped sections, summary bars, top toolbar, assignee picker, file upload via Supabase Storage. Mini brief queued at `fleet/queued/2026-05-09-mc-bookshelf-scaffold--mini.md`.
- **MMM hub copy + photo pass** — make it feel real, not template (#83).
- **HHH Shopify theme** — wrong-event-identity errors fixed; payment-ready audit pending (#102).
- **HHH route maps per distance** — 15/30/62/100 (#115).
- **MMM membership tiers** — finalize pricing + Stripe wiring + signup flow (#109).

## Hands-off — Brandon decides, I draft

- HHH event-day operations (route, day-of staffing, vendor logistics)
- Zebby's clinical/medical content — gates on Brandon AND Katlyn
- Pricing on net-new products
- Brand voice changes

## Open questions waiting on Brandon

- Auto-deploy permissions matrix confirmation (default: copy/posts/drafts auto-ship; net-new pages preview-then-ship; emails/posts/payments always ask)
- Telegram thread routing (default: Test Queue = new "Claude/Test-Queue" thread, Daily digest = Revenue Lab, Fleet health = new "Claude/Fleet-Status")
- Vercel pipe unblock (the one above)

---

*Append-only updates below this line.*
