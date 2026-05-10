# Session Brief — what's active right now

*Auto-updated by `~/Documents/Command-Center/update-session-brief.command`. Read this AFTER `CLAUDE-BOOTSTRAP.md` to know what to do FIRST in a new chat.*

---

## Last session ended: 2026-05-10 ~1:45am ET

## Current deploy truth

- **Mission Control:** live match. Local/origin/prod are `2076c4d`. MC deploy pipe is working again.
- **FlashFlow:** live match. Local/origin/prod are `c41751b`. Public bootstrap docs are live.
- **Zebby's World:** Vercel Git deployment is unblocked and `www.zebbysworld.com/api/health` reports `c0cc5bd`. Apex `zebbysworld.com` still returns Shopify 402 HTML because DNS includes both Vercel and Shopify A records. Do not change DNS without Brandon confirming.

## Top blocker

**Zebby's apex DNS is still split.** `www.zebbysworld.com` is the good Vercel path. Bare `zebbysworld.com` still sometimes goes to Shopify (`23.227.38.32`) and fails `/api/health`.

Fix path when Brandon confirms DNS work:
1. Decide whether apex should point to Vercel or redirect to `www`.
2. Remove the stray Shopify apex A record if Vercel is canonical.
3. Verify `https://zebbysworld.com/api/health` reports the same SHA as `git rev-parse --short HEAD`.

## Recently fixed

- MC queued commits deployed and verified through `/api/health`.
- MC Monday-style board work is live through commit `2076c4d`.
- FlashFlow build/typecheck/deploy are clean at `c41751b`.
- Zebby's health route now exposes Vercel commit SHA.
- Zebby's deploy reject was diagnosed: Vercel rejected commits authored by emails not attached to the GitHub account. Repo-local git author is now `228847278+Glomskib@users.noreply.github.com`.
- Local deploy checker now distinguishes Zebby's broken apex from the live `www` and Vercel branch alias.
- ChatGPT export found at `~/Downloads/2975b9d45de7932f6cbb70d54b67fc5798f017eacb60a93f1a2fcdab964a0714-2026-04-29-02-50-42-688f2491604c48ff9e8703627c31736e.zip`; search it with `tools/search_chatgpt_export.py`.

## Standing initiatives — pick from these when idle

- **HHH 2026 sponsor outreach** — 25 personalized first-touch drafts. Already drafted at `~/Documents/Claude/Projects/Mac Takeover/HHH-2026-SPONSOR-OUTREACH-25.md`. Need: contact discovery (Bolt brief queued at `fleet/queued/2026-05-09-sponsor-contacts-research--mini.md`).
- **HHH FB content next 30 days** — June 8 → July 7. Mini brief queued at `fleet/queued/2026-05-09-hhh-content-60-days--mini.md`.
- **Monday-style MC Phase 1 remaining** — top toolbar, assignee picker, file upload via Supabase Storage, and `/admin/board` polish after confirming what already shipped in `2076c4d`.
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
- Zebby's apex DNS: Vercel vs Shopify canonical path.
- Git author policy: add `miles@makingmilesmatter.com` and/or `brandon@makingmilesmatter.com` to GitHub if Brandon wants those emails to trigger Vercel deploys.

---

*Append-only updates below this line.*
