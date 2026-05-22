# This Week Command Board

Updated: 2026-05-21 20:31 EDT

Purpose: keep the AI fleet pointed at work that can finish this week, and keep irreversible actions waiting for Brandon.

Safety: this board is context only. Do not send email, post publicly, charge money, change DNS, publish Shopify, merge PRs, apply production migrations, create payment links, upload product files, or delete data without Brandon's exact approval.

## Fast Read

- Mission Control: live at `8f3d7d9`.
- FlashFlow: live at `6a7b16e` before this board refresh. This file lives inside FlashFlow, so every board/session-brief publish creates the next SHA; always verify `https://flashflowai.com/api/health` after pushing docs.
- Zebby's World: app is healthy on `www.zebbysworld.com` at `46f6b5a`. Bare `zebbysworld.com` remains approval-locked by apex DNS/certificate routing.
- MMM hub: app is healthy on `mmm-hub.vercel.app` at `e6c27e7`. `makingmilesmatter.org/api/health` still reports `8f3d7d9`, so the primary domain is routed to the wrong app until Brandon approves the fix.
- Latest launch report: `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/this-week-launch-status-2026-05-21-203124.md`
- Latest approval cockpit: `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/this-week-approval-cockpit-2026-05-21-203124/approval-cockpit.html`
- Latest HHH asset dashboard: `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-asset-collector-dashboard-2026-05-21-085415.md`
- Latest route gap board: `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-gap-closeout-2026-05-21-085320.md`
- Latest digital asset storefront preview: `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/digital-asset-storefront-preview-2026-05-21-095503/storefront-preview.html`
- Latest MC Telegram routing approval packet: `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/MC-telegram-routing-approval-packet-2026-05-21-145815.md`
- Latest MC Telegram routing dry-run report: `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/MC-telegram-routing-dry-run-2026-05-21-152645.md`
- Latest Mission Control Phase 1 QA report: `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/mission-control-phase1-qa-2026-05-21-122700/report.md`

## Brandon Approval Gates

Use exact phrases. Do not infer approval from vague agreement.

| Priority | Say this | What it unlocks | What stays blocked |
|---|---|---|---|
| 1 | `APPROVE MMM ORG TO MMM HUB` | Moves `makingmilesmatter.org` / `www.makingmilesmatter.org` to MMM Hub and verifies health. | No Stripe checkout, donation links, email, social, or DNS-provider changes unless helper proves aliases are not enough. |
| 2 | `APPROVE ZEBBYS APEX TO VERCEL` | Repairs bare `zebbysworld.com` so it matches the healthy `www` path. | No clinical copy changes, beta announcement, Shopify/domain strategy change, email, or social. |
| 3 | `MC Telegram: approve fleet alert routing defaults` | Lets me wire dry-run-first internal Telegram/fleet routing defaults for Revenue Lab, Making Miles Matter Inc, and private fallback. | No live Telegram sends until Brandon confirms the dry-run route report; no emails, public posts, payments, DNS, merges, migrations, Shopify publish, or deletes. |
| 4 | `Digital asset: approve v3 ZIP, price is $49, channel is Gumroad, refund window is 14 days, create draft listing only.` | Creates a draft-only listing from the clean v3 ZIP and local storefront preview. | No live publish, payment link announcement, email, social post, or charge. |
| 5 | `HHH sponsors: approve test batch 1` | Sends only guarded internal test copies for the five sponsor drafts from `miles@makingmilesmatter.com`. | No live sponsor emails until test copies are reviewed and separately approved. |
| 6 | `HHH Facebook: approved to schedule cleaned v2` | Moves the clean 30-post June 8-July 7 batch into guarded scheduling workflow. | No public posting when assets or partner approvals are missing for a post. |
| 7 | `TCG: merge PR1 then PR2; stop before prod migration` | Merges BuybackOS base stack, retargets/merges TCG ledger, then stops. | No production Supabase migration, live pricing, Stripe, or public registration. |
| 8 | `HHH routes: assets approved for Shopify draft wiring` | Wires approved route assets into the local/unpublished Shopify theme draft. | No Shopify publish. Route files/logistics still need completion first. |
| 9 | `HHH routes: approved to publish on Shopify` | Publishes final approved route cards live in Shopify. | No price/product/payment changes without separate approval. |

## Current Work State

- **HHH sponsor outreach:** ready for internal test approval only. Five `.eml` drafts exist; test sent `0`, live sent `0`. Sender must stay `miles@makingmilesmatter.com`.
- **HHH Facebook:** 30 local candidate images exist for 30 posts, but they are still review candidates. Nothing is scheduled or posted.
- **HHH routes:** still blocked for route wiring: 8 missing GPX/cue files, 28 blank worksheet fields, 16 pending review/approval fields.
- **TCG:** PR #1 and PR #2 are open as drafts and mergeable; Vercel author-email policy is an admin-awareness blocker, not a code conflict.
- **Digital asset:** v3 buyer ZIP is structurally ready with 8 buyer files and 0 private/internal leak hits; storefront preview is local-only. Needs Brandon approval before any draft listing.
- **Mission Control:** Phase 1 QA proof exists at `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/mission-control-phase1-qa-2026-05-21-122700/report.md`. Local admin surfaces passed, production admin routes stayed auth-gated, and the smoke suite passed 288/288 on the latest run.
- **MC Telegram routing:** approval packet exists at `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/MC-telegram-routing-approval-packet-2026-05-21-145815.md` and dry-run report exists at `/Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/MC-telegram-routing-dry-run-2026-05-21-152645.md`. Latest dry-run has 0 live sends and routes approval-locked actions to Brandon fallback.
- **MMM/Zebby's domains:** app deploys are healthy on alternate/canonical paths, but primary domains need exact approval before alias/DNS work.

## Safe Autonomous Work

AI agents can keep doing this without Brandon clicks:

- Refresh deploy/context docs and rerun health checks; after every FlashFlow docs push verify `/api/health` matches `git rev-parse --short HEAD`.
- Run `~/Documents/Command-Center/mission-control-phase1-qa.command` after MC changes or before fleet-routing work; keep its dated report in the vault.
- Refresh MC Telegram routing approval/dry-run reports, but do not enable live Telegram sends without Brandon's exact approval.
- Improve local approval/review packets, checklists, and proof bundles.
- Draft-only HHH sponsor/email/social refinements using `miles@makingmilesmatter.com`, but do not send.
- HHH Facebook candidate review aids, dry-runs, image inventory, and approval packets, but do not schedule or post.
- HHH route asset intake packets, route gap reports, worksheet validation, and Shopify draft-prep notes, but do not upload files, wire Shopify, or publish route pages.
- MMM copy/photo inventory and Stripe test plans, but do not create live payment links.
- TCG PR review, test reruns, author-email policy notes, docs, and local-only migration rehearsal.
- Digital asset listing drafts, cover variants, support macros, storefront previews, draft listing bundle prep, and preflight checks. Use the v3 buyer ZIP only; do not publish or charge.

## Hands-Off Until Brandon Says So

- Sending any email.
- Posting or scheduling social content.
- Charging money, creating live payment links, or enabling checkout.
- DNS, Vercel alias moves, Shopify publish, PR merge, production migration, or deletes.
- Zebby's clinical/medical content without Brandon and Katlyn.

## One-Reply Commands

- `APPROVE MMM ORG TO MMM HUB`
- `APPROVE ZEBBYS APEX TO VERCEL`
- `MC Telegram: approve fleet alert routing defaults`
- `HHH sponsors: approve test batch 1`
- `HHH Facebook: approved to schedule cleaned v2`
- `HHH routes: assets approved for Shopify draft wiring`
- `HHH routes: approved to publish on Shopify`
- `TCG: merge PR1 then PR2; stop before prod migration`
- `Digital asset: approve v3 ZIP, price is $49, channel is Gumroad, refund window is 14 days, create draft listing only.`

Until one of those appears, keep shipping draft/code/QA/proof work only.
