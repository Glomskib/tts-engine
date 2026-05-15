# Session Brief — what's active right now

*Auto-updated by `~/Documents/Command-Center/update-session-brief.command`. Read this AFTER `CLAUDE-BOOTSTRAP.md` to know what to do FIRST in a new chat.*

---

## Last refreshed: 2026-05-15 ~8:40am ET

## Current deploy truth

- **Mission Control:** live match. Local/origin/prod are `3f9f93a`. MC deploy pipe is working. `mc.flashflowai.com` was briefly mis-aliased to the wrong Vercel project (`mc-flashflowai`) on May 15; it has been restored to the `mission-control` deployment.
- **FlashFlow:** deploy pipe is healthy. This file lives inside the FlashFlow app, so every brief refresh creates a new health SHA; verify `https://flashflowai.com/api/health` matches `git rev-parse --short HEAD` after each push.
- **Zebby's World:** app deploy is healthy on `www.zebbysworld.com` and the Vercel branch alias at `46f6b5a`. Bare `zebbysworld.com` still returns Shopify 402 HTML. Do not change DNS without Brandon confirming.
- **MMM hub:** `mmm-hub.vercel.app` is live at `73814f5`. `https://makingmilesmatter.org/api/health` now answers JSON, but reports `9700687` instead of the MMM hub SHA, so the primary domain/path is still routed to the wrong app. Do not change DNS without Brandon confirming.

## Top blockers

- **Zebby's apex DNS is still split.** `www.zebbysworld.com` is the good Vercel path. Bare `zebbysworld.com` still sometimes goes to Shopify (`23.227.38.32`) and fails `/api/health`.
- **MMM primary domain is still not routed to the hub.** `https://mmm-hub.vercel.app/api/health` reports `73814f5`, but `https://makingmilesmatter.org/api/health` reports Mission Control SHA `9700687`.

Fix path when Brandon confirms DNS work:
1. Decide the canonical domain for each app before changing DNS.
2. Remove stray/old routing records only after Brandon confirms the target.
3. Verify the app health URL reports the same SHA as `git rev-parse --short HEAD`.

## Recently finished

- MC Monday-style Phase 1 is deployed and verified through `/api/health`; current live SHA is `9fd692b`. Completed: colored pills, inline edit, grouped sections, summary bars, top toolbar, assignee/row assignment, file upload via Supabase Storage, `/admin/board`, workspace filter, comments, live bookshelf counts, and `/admin/brief` for composing fleet briefs from the UI.
- MC Phase 1 smoke coverage is live. Fixed stale task-manager smoke checks after the board refactor and added `mc-phase1-board` coverage for `/admin/board`, `/admin/brief`, BoardView toolbar modes, workspace/person filters, task comments, proof uploads, bookshelf counts, and fleet brief route guards.
- MC local browser QA is unblocked and deployed at `4a69912`. Middleware now honors `MC_DEV_OPEN_AUTH=true` only in `next dev` and only when no MC tokens are configured, forwards trusted local admin headers, and local SQLite auto-creates `./data` for clean checkouts. Verified `/admin/board`, `/admin/tasks`, `/admin/brief`, and board API locally.
- MC agent status sync is hardened and deployed at `07cf982`. Mission Control task update, complete, block, verify, and proof auto-complete routes now free/block agents by `id` OR `name`, matching the board assignment behavior and legacy task route. Smoke coverage now guards that pattern.
- MC proof/upload edge cases are hardened and deployed at `9fd692b`. Uploads now reject wrong content types and oversized multipart requests before parsing, sanitize optional form fields, strip risky leading-dot filenames, and use `COALESCE` for proof counters. JSON proof posts now reject malformed/non-object JSON and non-string proof values before insert/validation. Verified locally with full dev-open smoke: 288 pass, 0 fail, 0 warn, 0 skip.
- MC custom domain alias was repaired after `mc.flashflowai.com` started returning Vercel `NOT_FOUND`; `vercel alias set mission-control-2ed7oirlf-brandons-projects-94dcab35.vercel.app mc.flashflowai.com` restored the domain and `/api/health` now reports the current Mission Control deploy SHA.
- FlashFlow launch-week create polish is deployed at `65108df`: `/create` now has opt-in B-roll/music toggles defaulting off, the cooking page has friendlier progress/copy/share/failure states, homepage auth redirect was relaxed, public privacy copy uses generic vendor categories, and layout metadata supports Google Search Console + Bing verification through env vars.
- Zebby's health route exposes Vercel commit SHA; `www` and branch alias report `c0cc5bd`.
- HHH sponsor contact research saved to `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-contacts-research-2026-05-09.md`.
- HHH sponsor send queue saved to `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-outreach-send-queue-2026-05-10.md`.
- HHH stale sponsor replacement drafts saved to `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-replacement-drafts-2026-05-10.md`.
- HHH Facebook posts for June 8 through July 7 drafted at `~/Documents/Claude/Projects/Mac Takeover/HHH-FB-POSTS-60-90-DAYS-2026-06-08.md`.
- HHH Shopify theme route section now supports four distance route cards locally; production packet saved at `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-map-production-packet-2026-05-10.md`. Not published to Shopify.
- HHH Shopify payment-ready audit saved to `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-shopify-payment-ready-audit-2026-05-10.md`. Local theme now loads registration JS, updates Shopify variant IDs before add-to-cart, and passes theme check with 7 layout-only warnings. Not published to Shopify.
- HHH Shopify product setup packet and draft catalog saved to `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-shopify-product-setup-packet-2026-05-10.md` and `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-shopify-products-draft-2026-05-10.csv`. Draft only; nothing created in Shopify.
- MMM hub source is cloned at `~/projects/mmm-hub`; commit `73814f5` is live on `mmm-hub.vercel.app`. Fixed: added `/api/health`, removed the visible hero photo placeholder, removed fake-looking testimonial content, replaced unverified impact stats with launch-state facts, corrected HHH 2026 date/routes to September 12 and 15/30/62/100, changed one-time donate CTA away from placeholder checkout, and softened membership/tax wording before Stripe wiring.
- MMM membership/Stripe approval packet saved to `~/Documents/MacBook Pro VAULT/10-Projects/MMM-membership-stripe-approval-packet-2026-05-10.md`. It recommends the current $5/$15/$35 monthly ladder, nonprofit Stripe env names, checkout test matrix, and a no-charge launch path pending Brandon approval.
- TCG Buying Group BuybackOS evaluation saved to `~/Documents/MacBook Pro VAULT/10-Projects/TCG-on-BuybackOS-eval-2026-05-10.md`. Recommendation: extend BuybackOS with a narrow Brandon-only TCG operator ledger instead of building from scratch.
- TCG operator ledger is now in draft PR #2: `https://github.com/Glomskib/buybackos/pull/2`, branch `codex/tcg-operator-ledger-stacked`, stacked on BuybackOS base-stack PR #1. GitHub reports PR #2 `MERGEABLE`. It includes allocation core, `/dashboard/tcg`, Brandon-only write actions, transaction-safe allocation RPC wiring, validated migrations/scripts, and `docs/tcg-operator-ledger-rollout.md` with merge order, verification, production gates, and rollback notes. Verified after stacking: `npm run test:tcg-allocation`, `npm run test:tcg-dashboard`, `npm run test:tcg-actions`, `npm run test:tcg-rpc`, `npx tsc --noEmit --pretty false`, `npm run lint` with warnings only, and production build with dummy local Supabase env. Rollback-only local RPC smoke was attempted but Docker was not running on this Mac, so it could not connect to the local Supabase container. TCG has not been merged, deployed to production, migrated to production, priced, or made public.
- BuybackOS base stack is now in draft PR #1: `https://github.com/Glomskib/buybackos/pull/1`, branch `codex/buybackos-base-stack`. It includes the 22 local base commits plus the baseline cleanup, has been merged with the current `origin/main` snapshot, and GitHub reports it `MERGEABLE`. Verified in the isolated worktree: `npx tsc --noEmit --pretty false`, `npm run lint` with warnings only, and production build with dummy local Supabase env.
- Digital assets: first local product package draft created at `~/Documents/MacBook Pro VAULT/10-Projects/digital-assets/endurance-event-directors-toolkit/`. Buyer-ready v2 ZIP draft: `endurance-event-directors-toolkit-public-draft-v2.zip` with README, quick start, license/disclaimer, sponsor pipeline CSV, route readiness, registration/store checklist, volunteer run sheet, and event launch plan. Private HHH dogfood source map and seller launch assets are excluded from the buyer ZIP. Seller launch assets now include `assets/cover.svg`, `launch-assets/platform-listing-copy.md`, `launch-assets/support-and-refund-macros.md`, and `launch-assets/final-preflight-checklist.md`. ZIP test passed with 9 files and SHA-256 `35ac90e36bc296b80a6e4a3fe7c2b79931f33062062ff00440fd20afba778c1c`. Launch approval still needed before listing, payment link, or announcement.

## Standing initiatives — pick from these when idle

- **HHH sponsor outreach:** research and send queue are ready. Need Brandon approval before any email sends; use `miles@makingmilesmatter.com` only.
- **HHH Facebook content:** June 8-July 7 batch is drafted. Need Brandon approval before scheduling/posting.
- **HHH route maps:** theme supports 15/30/62/100 cards locally. Need final RideWithGPS/Strava URLs, GPX files, cue sheets, and Joshua/logistics review before publishing.
- **Mission Control Phase 2 / QA:** Phase 1 board, workspace, assignment, upload, and brief-composer pieces are live, smoke-covered, and locally browser-QAable without Brandon clicks. Next useful work: production-session browser QA for `/admin/brief`, `/admin/board`, and `/admin/tasks`, then wire Telegram/fleet alert routing after Brandon confirms thread defaults.
- **MMM hub copy + photo pass:** source cleanup and membership copy safety pass are live at `73814f5`. Next: fix `makingmilesmatter.org` routing after Brandon confirms DNS/domain path, add real MMM/HHH photos when assets exist, and wire real one-time donations/Stripe checkout after pricing/payment decisions.
- **HHH Shopify theme:** payment-ready audit, theme check cleanup, and draft product setup packet are done. Next: Brandon approves prices/legal, then create draft Shopify products and run unpublished test orders before any publish.
- **MMM membership tiers:** finalize pricing + Stripe wiring + signup flow (#109).
- **TCG Buying Group:** PR #1 (BuybackOS base stack) and stacked PR #2 (TCG operator ledger) are both open as drafts and mergeable. Next unblocked step: review/merge PR #1, then retarget/merge PR #2. Do not apply production migrations, enable live Stripe pricing, or open public registration without Brandon approval.
- **Digital assets:** Endurance Event Director's Toolkit v2 buyer ZIP, cover SVG, platform listing copy, support/refund macros, and final preflight checklist exist locally. Next: Brandon approves final name/price/sales channel/refund posture, then create the draft product listing. Do not publish or charge without approval.

## Hands-off — Brandon decides, I draft

- HHH event-day operations (route, day-of staffing, vendor logistics)
- Zebby's clinical/medical content — gates on Brandon AND Katlyn
- Pricing on net-new products
- Brand voice changes
- Sending email, posting social, charging money, DNS, or deletes

## Open questions waiting on Brandon

- Zebby's apex DNS: Vercel vs Shopify canonical path.
- MMM primary domain: point `makingmilesmatter.org` at the live Vercel hub or keep the current `/lander` path.
- HHH sponsor batch approval: approve, edit, or hold the Monday-ready send queue.
- HHH Facebook batch approval: approve, edit, or hold June 8-July 7 posts.
- HHH route assets: final RideWithGPS/GPX/cue-sheet ownership and logistics review.
- Auto-deploy permissions matrix confirmation.
- Telegram thread routing.
- BuybackOS / TCG merge order: draft PR #1 is open and mergeable; stacked draft PR #2 is open and mergeable against PR #1. Review/merge PR #1 first, then retarget/merge PR #2.
- Git author policy: add `miles@makingmilesmatter.com` and/or `brandon@makingmilesmatter.com` to GitHub if Brandon wants those emails to trigger Vercel deploys.

---

*Append-only updates below this line.*
