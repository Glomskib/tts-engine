# This Week Command Board

Updated: 2026-05-16 6:28pm ET

Purpose: keep the AI fleet pointed at work that can finish this week, and keep irreversible actions waiting for Brandon.

## Live Health

- Mission Control: live at `5d8db46`.
- FlashFlow: deploy pipe is healthy at `384513e` before this docs refresh. Check `https://flashflowai.com/api/health` after each brief push because the docs live inside FlashFlow.
- Zebby's World: app is healthy at `www.zebbysworld.com` and the Vercel branch alias. Bare `zebbysworld.com` is still blocked by apex DNS/certificate mismatch.
- MMM hub: app is healthy at `mmm-hub.vercel.app` on `e6c27e7`. `makingmilesmatter.org/api/health` is still routed to Mission Control.

## Brandon Approval Gates

These are the decisions blocking public launch or money movement. Do not do them without Brandon.

1. Zebby's domain path: approve removing Shopify apex A record `23.227.38.32` and keeping Vercel A record `76.76.21.21`, or keep bare domain on Shopify.
2. MMM domain path: approve moving `makingmilesmatter.org` and `www.makingmilesmatter.org` aliases from Mission Control to MMM Hub, or keep current Mission Control routing.
3. TCG merge path: PR #1 and PR #2 are mergeable, but Vercel has an author-email policy warning. Packet: `~/Documents/MacBook Pro VAULT/10-Projects/TCG-author-email-policy-unblock-2026-05-16.md`. Merge BuybackOS PR #1, retarget/merge PR #2, then stop before production Supabase migrations.
4. HHH sponsor outreach: approve, edit, or hold the prepared sponsor send queue. Approval sheet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-approval-sheet-2026-05-15.md`. Guarded test-batch helper: `~/Documents/Command-Center/hhh-sponsor-test-batch-after-approval.command`; it has prepared 5 review `.eml` files and has sent 0 emails.
5. HHH Facebook batch: approve, edit, or hold the June 8-July 7 clean v2 posts. Asset shot list, request packet, preflight, and photo intake helper exist locally. Latest photo intake packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-photo-intake-packet-2026-05-16-162838.md`. Current state: 30 expected images, 0 present, 30 missing, zero risk-scan hits, no posts scheduled/published.
6. HHH route assets: approve, edit, or hold route asset wiring. Route approval packet, request packet, preflight, and route intake helper exist locally. Latest route intake packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-intake-packet-2026-05-16-165844.md`. Current state: 8 missing GPX/cue files, 28 blank worksheet fields, 16 pending review/approval fields, 35 preflight blockers. Need final RideWithGPS/Strava URLs, GPX files, cue sheets, rest-stop mile markers, SAG notes, and Joshua/Brandon logistics approval before Shopify wiring/publish.
7. Pricing: confirm HHH entry fees, MMM membership tiers, FlashFlow paid plan, TCG member fee, and first digital asset price.
8. Digital asset listing: v3 buyer ZIP and local draft listing bundle are ready. Approval phrase below creates a draft listing only; no publish, payment link announcement, email, or social post.

## Brandon Decision Menu

Use these exact phrases when Brandon wants one lane unblocked. Do not infer approval from vague agreement.

| Priority | Say this | What it unlocks | What stays blocked |
|---|---|---|---|
| 1 | `APPROVE MMM ORG TO MMM HUB` | Moves `makingmilesmatter.org` / `www.makingmilesmatter.org` to MMM Hub and verifies health. | No Stripe checkout, donation links, or DNS-provider changes without another yes. |
| 2 | `APPROVE ZEBBYS APEX TO VERCEL` | Repairs bare `zebbysworld.com` so it matches the healthy `www` app path. | No clinical copy changes, public beta announcement, or broader domain strategy change. |
| 3 | `HHH sponsors: approve test batch 1` | Sends only the guarded internal test copies for the 5 sponsor drafts from `miles@makingmilesmatter.com`. | No live sponsor emails until test copies are reviewed and separately approved. |
| 4 | `HHH Facebook: approved to schedule cleaned v2` | Moves the clean 30-post June 8-July 7 batch into scheduling workflow. | No public posting when assets or partner approvals are missing for a post. |
| 5 | `TCG: merge PR1 then PR2; stop before prod migration` | Merges BuybackOS base stack, retargets/merges TCG ledger, then stops. | No production Supabase migration, live pricing, Stripe, or public registration. |
| 6 | `HHH routes: assets approved for Shopify draft wiring` | Wires approved route assets into the local/unpublished Shopify theme draft. | No Shopify publish. |
| 7 | `HHH routes: approved to publish on Shopify` | Publishes final approved route cards live in Shopify. | No price/product/payment changes without separate approval. |
| 8 | `Digital asset: approve v3 ZIP, price is $49, channel is Gumroad, refund window is 14 days, create draft listing only.` | Creates a draft-only listing from the vetted v3 ZIP and local bundle. | No live publish, payment link announcement, email, or social post. |

## Safe Autonomous Work

AI agents can keep doing this without Brandon clicks:

- Refresh deploy/context docs and rerun health checks, but after every FlashFlow push verify `/api/health` matches `git rev-parse --short HEAD`.
- Production-session QA for Mission Control `/admin/brief`, `/admin/board`, and `/admin/tasks`.
- Draft-only HHH sponsor/email/social refinements using `miles@makingmilesmatter.com` as the sender identity, but do not send.
- HHH Facebook image inventory, local photo intake packets, and route/logistics review notes for the clean v2 batch, but do not schedule or post.
- HHH route asset intake packets, preflight reports, and worksheet updates, but do not upload files, wire Shopify, or publish route pages.
- MMM photo/copy inventory and Stripe test plan, but do not create live payment links.
- TCG PR review, test reruns, author-email policy notes, docs, and local-only migration rehearsal.
- Digital asset listing drafts, cover variants, support macros, draft listing bundle prep, and preflight checks. Use the v3 buyer ZIP only; do not publish or charge.

## One-Reply Commands

Brandon can unblock a lane with one sentence:

- `DNS: Zebby WWW canonical`
- `DNS: MMM hub canonical`
- `DNS: approve both from domain packet`
- `APPROVE MMM ORG TO MMM HUB`
- `APPROVE ZEBBYS APEX TO VERCEL`
- `TCG: merge PR1 then PR2; stop before prod migration`
- `TCG: merge PR1 then PR2 and prepare prod migration approval packet`
- `HHH sponsors: approved to send`
- `HHH sponsors: approve test batch 1`
- `HHH Facebook: clean v2 approved for review; do not schedule`
- `HHH Facebook: approved to schedule cleaned v2`
- `HHH routes: assets approved for Shopify draft wiring`
- `HHH routes: approved to publish on Shopify`
- `Digital asset: price is $X on Gumroad/Stripe/Shopify`
- `Digital asset: approve v3 ZIP, price is $49, channel is Gumroad, refund window is 14 days, create draft listing only.`

Until one of those appears, keep shipping draft/code/QA work only.
