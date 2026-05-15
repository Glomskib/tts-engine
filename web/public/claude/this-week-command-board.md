# This Week Command Board

Updated: 2026-05-15 9:04am ET

Purpose: keep the AI fleet pointed at work that can finish this week, and keep irreversible actions waiting for Brandon.

## Live Health

- Mission Control: live at `555439a`.
- FlashFlow: live at current FlashFlow `master`; check `https://flashflowai.com/api/health` after each brief push.
- Zebby's World: app is healthy at `www.zebbysworld.com` and the Vercel branch alias. Bare `zebbysworld.com` is still routed away from the app.
- MMM hub: app is healthy at `mmm-hub.vercel.app`. `makingmilesmatter.org/api/health` is still routed to Mission Control.

## Brandon Approval Gates

These are the decisions blocking public launch or money movement. Do not do them without Brandon.

1. Zebby's domain path: make `www.zebbysworld.com` canonical and redirect bare domain there, or keep bare domain on Shopify.
2. MMM domain path: point `makingmilesmatter.org` to the MMM hub, or keep the current non-hub routing.
3. TCG merge path: merge BuybackOS PR #1, retarget/merge PR #2, then approve production Supabase migrations.
4. HHH sponsor outreach: approve, edit, or hold the prepared sponsor send queue.
5. HHH Facebook batch: approve, edit, or hold the June 8-July 7 posts.
6. Pricing: confirm HHH entry fees, MMM membership tiers, FlashFlow paid plan, TCG member fee, and first digital asset price.

## Safe Autonomous Work

AI agents can keep doing this without Brandon clicks:

- Production-session QA for Mission Control `/admin/brief`, `/admin/board`, and `/admin/tasks`.
- Draft-only HHH sponsor/email/social refinements using `miles@makingmilesmatter.com` as the sender identity, but do not send.
- MMM photo/copy inventory and Stripe test plan, but do not create live payment links.
- TCG PR review, test reruns, docs, and local-only migration rehearsal.
- Digital asset listing drafts, cover variants, support macros, and preflight checks, but do not publish or charge.

## One-Reply Commands

Brandon can unblock a lane with one sentence:

- `DNS: Zebby WWW canonical`
- `DNS: MMM hub canonical`
- `TCG: merge PR1 then PR2; stop before prod migration`
- `TCG: merge PR1 then PR2 and prepare prod migration approval packet`
- `HHH sponsors: approved to send`
- `HHH Facebook: approved to schedule`
- `Digital asset: price is $X on Gumroad/Stripe/Shopify`

Until one of those appears, keep shipping draft/code/QA work only.
