# Session Brief — what's active right now

*Auto-updated by `~/Documents/Command-Center/update-session-brief.command`. Read this AFTER `CLAUDE-BOOTSTRAP.md` to know what to do FIRST in a new chat.*

---

## Last refreshed: 2026-05-10 ~7:08am ET

## Current deploy truth

- **Mission Control:** live match. Local/origin/prod are `b1ad9da`. MC deploy pipe is working.
- **FlashFlow:** deploy pipe is working and public bootstrap/session docs are live. Because this brief lives inside the FlashFlow repo, verify the exact current SHA with `https://flashflowai.com/api/health` instead of pinning it here.
- **Zebby's World:** app deploy is healthy on `www.zebbysworld.com` and the Vercel branch alias at `c0cc5bd`. Bare `zebbysworld.com` still returns Shopify 402 HTML because DNS includes both Vercel and Shopify A records. Do not change DNS without Brandon confirming.

## Top blocker

**Zebby's apex DNS is still split.** `www.zebbysworld.com` is the good Vercel path. Bare `zebbysworld.com` still sometimes goes to Shopify (`23.227.38.32`) and fails `/api/health`.

Fix path when Brandon confirms DNS work:
1. Decide whether apex should point to Vercel or redirect to `www`.
2. Remove the stray Shopify apex A record if Vercel is canonical.
3. Verify `https://zebbysworld.com/api/health` reports the same SHA as `git rev-parse --short HEAD`.

## Recently finished

- MC Monday-style Phase 1 is deployed and verified through `/api/health`; current live SHA is `b1ad9da`. Completed: colored pills, inline edit, grouped sections, summary bars, top toolbar, assignee/row assignment, file upload via Supabase Storage, `/admin/board`, workspace filter, comments, and live bookshelf counts.
- FlashFlow security cleanup/docs deploy is live; exact SHA is intentionally not pinned in this file because each brief refresh creates a new FlashFlow commit.
- Zebby's health route exposes Vercel commit SHA; `www` and branch alias report `c0cc5bd`.
- HHH sponsor contact research saved to `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-contacts-research-2026-05-09.md`.
- HHH sponsor send queue saved to `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-outreach-send-queue-2026-05-10.md`.
- HHH stale sponsor replacement drafts saved to `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-replacement-drafts-2026-05-10.md`.
- HHH Facebook posts for June 8 through July 7 drafted at `~/Documents/Claude/Projects/Mac Takeover/HHH-FB-POSTS-60-90-DAYS-2026-06-08.md`.
- HHH Shopify theme route section now supports four distance route cards locally; production packet saved at `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-map-production-packet-2026-05-10.md`. Not published to Shopify.

## Standing initiatives — pick from these when idle

- **HHH sponsor outreach:** research and send queue are ready. Need Brandon approval before any email sends; use `miles@makingmilesmatter.com` only.
- **HHH Facebook content:** June 8-July 7 batch is drafted. Need Brandon approval before scheduling/posting.
- **HHH route maps:** theme supports 15/30/62/100 cards locally. Need final RideWithGPS/Strava URLs, GPX files, cue sheets, and Joshua/logistics review before publishing.
- **Mission Control Phase 2 / QA:** Phase 1 board, workspace, assignment, and upload pieces are live. Next useful work: browser QA `/admin/board` and `/admin/tasks`, harden assignment/upload edge cases, then wire Telegram/fleet alert routing after Brandon confirms thread defaults.
- **MMM hub copy + photo pass:** make it feel real, not template (#83).
- **HHH Shopify theme:** payment-ready audit still pending (#102); local route-card work is not published.
- **MMM membership tiers:** finalize pricing + Stripe wiring + signup flow (#109).
- **Digital assets:** package HHH event-ops templates/agents into the first income asset.

## Hands-off — Brandon decides, I draft

- HHH event-day operations (route, day-of staffing, vendor logistics)
- Zebby's clinical/medical content — gates on Brandon AND Katlyn
- Pricing on net-new products
- Brand voice changes
- Sending email, posting social, charging money, DNS, or deletes

## Open questions waiting on Brandon

- Zebby's apex DNS: Vercel vs Shopify canonical path.
- HHH sponsor batch approval: approve, edit, or hold the Monday-ready send queue.
- HHH Facebook batch approval: approve, edit, or hold June 8-July 7 posts.
- HHH route assets: final RideWithGPS/GPX/cue-sheet ownership and logistics review.
- Auto-deploy permissions matrix confirmation.
- Telegram thread routing.
- Git author policy: add `miles@makingmilesmatter.com` and/or `brandon@makingmilesmatter.com` to GitHub if Brandon wants those emails to trigger Vercel deploys.

---

*Append-only updates below this line.*
