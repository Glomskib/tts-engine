# This Week Command Board

Updated: 2026-05-16 3:33am ET

Purpose: keep the AI fleet pointed at work that can finish this week, and keep irreversible actions waiting for Brandon.

## Live Health

- Mission Control: live at `90686ef`.
- FlashFlow: deploy pipe is healthy; the checker saw `637132e` before this docs refresh. Check `https://flashflowai.com/api/health` after each brief push because the docs live inside FlashFlow.
- Zebby's World: app is healthy at `www.zebbysworld.com` and the Vercel branch alias. Bare `zebbysworld.com` is still blocked by apex DNS/certificate mismatch.
- MMM hub: app is healthy at `mmm-hub.vercel.app` on `e6c27e7`. `makingmilesmatter.org/api/health` is still routed to Mission Control.

## Brandon Approval Gates

These are the decisions blocking public launch or money movement. Do not do them without Brandon.

1. Zebby's domain path: approve removing Shopify apex A record `23.227.38.32` and keeping Vercel A record `76.76.21.21`, or keep bare domain on Shopify.
2. MMM domain path: approve moving `makingmilesmatter.org` and `www.makingmilesmatter.org` aliases from Mission Control to MMM Hub, or keep current Mission Control routing.
3. TCG merge path: merge BuybackOS PR #1, retarget/merge PR #2, then approve production Supabase migrations.
4. HHH sponsor outreach: approve, edit, or hold the prepared sponsor send queue. Approval sheet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-approval-sheet-2026-05-15.md`. Guarded test-batch helper: `~/Documents/Command-Center/hhh-sponsor-test-batch-after-approval.command`; it has prepared 5 review `.eml` files and has sent 0 emails.
5. HHH Facebook batch: approve, edit, or hold the June 8-July 7 clean v2 posts. Review file: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-clean-v2-review-2026-05-16.md`; tracker: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-clean-v2-approval-tracker-2026-05-16.csv`. Verification passed: zero risk-scan hits and no posts scheduled/published.
6. HHH route assets: approve, edit, or hold route asset wiring. Packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-assets-approval-packet-2026-05-16.md`; worksheet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-logistics-review-worksheet-2026-05-16.csv`. Need final RideWithGPS/Strava URLs, GPX files, cue sheets, rest-stop mile markers, SAG notes, and Joshua/Brandon logistics approval before Shopify wiring/publish.
7. Pricing: confirm HHH entry fees, MMM membership tiers, FlashFlow paid plan, TCG member fee, and first digital asset price.

## Safe Autonomous Work

AI agents can keep doing this without Brandon clicks:

- Refresh deploy/context docs and rerun health checks, but after every FlashFlow push verify `/api/health` matches `git rev-parse --short HEAD`.
- Production-session QA for Mission Control `/admin/brief`, `/admin/board`, and `/admin/tasks`.
- Draft-only HHH sponsor/email/social refinements using `miles@makingmilesmatter.com` as the sender identity, but do not send.
- HHH Facebook image inventory and route/logistics review notes for the clean v2 batch, but do not schedule or post.
- HHH route asset prep and worksheet updates, but do not upload files, wire Shopify, or publish route pages.
- MMM photo/copy inventory and Stripe test plan, but do not create live payment links.
- TCG PR review, test reruns, docs, and local-only migration rehearsal.
- Digital asset listing drafts, cover variants, support macros, and preflight checks. Use the v3 buyer ZIP only; do not publish or charge.

## One-Reply Commands

Brandon can unblock a lane with one sentence:

- `DNS: Zebby WWW canonical`
- `DNS: MMM hub canonical`
- `DNS: approve both from domain packet`
- `TCG: merge PR1 then PR2; stop before prod migration`
- `TCG: merge PR1 then PR2 and prepare prod migration approval packet`
- `HHH sponsors: approved to send`
- `HHH sponsors: approve test batch 1`
- `HHH Facebook: clean v2 approved for review; do not schedule`
- `HHH Facebook: approved to schedule cleaned v2`
- `HHH routes: assets approved for Shopify draft wiring`
- `HHH routes: approved to publish on Shopify`
- `Digital asset: price is $X on Gumroad/Stripe/Shopify`

Until one of those appears, keep shipping draft/code/QA work only.
