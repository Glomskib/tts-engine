# Current state — what's active right now

*Auto-updated by `~/Documents/Command-Center/update-context-folder.command`. Last manual edit + auto-update timestamps below.*

---

## Last manual edit: 2026-05-15

## Authoritative Update - 2026-05-16 11:29pm ET

Read `session-brief.md` and `this-week-command-board.md` first. They are the current source of truth.

Current deploy truth:

- Mission Control is live-match healthy at `5d8db46`.
- FlashFlow deploy pipe is healthy at `f034cea` before this docs refresh after the avatar API error-code fix. Public-doc refreshes create a newer FlashFlow health SHA, so verify `/api/health` against local HEAD after every push.
- Zebby's app is live on `www.zebbysworld.com` / Vercel branch alias at `46f6b5a`; bare `zebbysworld.com` is blocked by apex DNS/certificate mismatch.
- MMM Hub is live on `mmm-hub.vercel.app` at `e6c27e7`; `makingmilesmatter.org` is still routed to Mission Control.
- HHH sponsor outreach, Facebook content, and route assets are in guarded draft state. Sponsor test copies exist locally with 0 sends. Facebook clean v2 plus approval tracker, asset shot list, asset request packet, asset preflight, and photo intake helper exist locally with zero risk-scan hits; image inbox currently has 0 of 30 files. Latest photo intake packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-photo-intake-packet-2026-05-16-162838.md`. Route/logistics worksheet, route asset request packet, route preflight, and route intake helper exist locally; route preflight currently lists 35 missing/review blockers, and the intake packet narrows this to 8 missing GPX/cue files, 28 blank worksheet fields, and 16 pending review/approval fields. Latest route intake packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-intake-packet-2026-05-16-165844.md`. Nothing has been sent, scheduled, posted, uploaded, or published.
- TCG PR #1 and PR #2 are mergeable but still drafts; Vercel has an author-email policy warning, not a code conflict. Read `~/Documents/MacBook Pro VAULT/10-Projects/TCG-author-email-policy-unblock-2026-05-16.md` before merge approval.
- Digital asset v3 buyer ZIP is structurally ready for Brandon review. Local preflight and draft listing bundle helpers exist; latest bundle is `~/Documents/MacBook Pro VAULT/10-Projects/digital-asset-draft-listing-bundle-2026-05-16-132700/`. Do not publish, upload, charge, email, or post publicly without Brandon approval.

Do not change DNS or Vercel aliases without Brandon. Exact domain approval packet:

`~/Documents/MacBook Pro VAULT/10-Projects/domain-routing-approval-packet-2026-05-15.md`

Guarded helper after approval:

`~/Documents/Command-Center/fix-domain-routing-after-approval.command`

Read-only launch status helper:

`~/Documents/Command-Center/this-week-launch-status.command --write-report`

It prints the deploy state, domain guardrail dry-runs, HHH sponsor/Facebook/route readiness, latest HHH photo/route intake packets, TCG readiness, digital asset ZIP/listing-bundle safety, guarded helpers, next blockers, and Brandon's decision menu. Latest verified report: `~/Documents/MacBook Pro VAULT/10-Projects/this-week-launch-status-2026-05-16-182825.md`. It does not send, post, charge, change DNS, publish Shopify, merge PRs, run migrations, or delete data.

Current HHH approval-ready files:

- Sponsor test runbook: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-test-send-runbook-2026-05-16.md`
- Sponsor review copies: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-sponsor-test-batch-1-review/`
- Facebook clean v2 review: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-clean-v2-review-2026-05-16.md`
- Facebook clean v2 preflight: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-clean-v2-preflight-2026-05-16.md`
- Facebook scheduling packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-clean-v2-scheduling-packet-2026-05-16.md`
- Facebook approval tracker: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-clean-v2-approval-tracker-2026-05-16.csv`
- Facebook asset shot list: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-clean-v2-asset-shot-list-2026-05-16.md`
- Facebook asset request packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-clean-v2-asset-request-packet-2026-05-16.md`
- Facebook photo intake helper: `~/Documents/Command-Center/hhh-facebook-photo-intake-packet.command`
- Facebook latest photo intake packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-facebook-photo-intake-packet-2026-05-16-162838.md`
- Route assets approval packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-assets-approval-packet-2026-05-16.md`
- Route assets request packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-assets-request-packet-2026-05-16.md`
- Route logistics worksheet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-logistics-review-worksheet-2026-05-16.csv`
- Route intake helper: `~/Documents/Command-Center/hhh-route-intake-packet.command`
- Route latest intake packet: `~/Documents/MacBook Pro VAULT/10-Projects/HHH-2026-route-intake-packet-2026-05-16-165844.md`

Fastest useful approvals now:

- `APPROVE MMM ORG TO MMM HUB`
- `APPROVE ZEBBYS APEX TO VERCEL`
- `HHH sponsors: approve test batch 1`
- `HHH Facebook: approved to schedule cleaned v2`
- `HHH routes: assets approved for Shopify draft wiring`
- `HHH routes: approved to publish on Shopify`
- `TCG: merge PR1 then PR2; stop before prod migration`
- `Digital asset: approve v3 ZIP, price is $49, channel is Gumroad, refund window is 14 days, create draft listing only.`

## STATUS — DEPLOY UNBLOCKED ✓

Codex resolved the Vercel deploy pipe overnight (2026-05-09 → 05-10). Production caught up. The full queued autonomy layer is LIVE.

```
mc.flashflowai.com/api/health:
  version:  6db0bdb       ← matches origin/main HEAD
  schema:   45            ← Turso (NOT Supabase)
  backend:  turso
  ok:       true
```

## CRITICAL CORRECTION (saved to memory)

**MC's task DB is Turso/libSQL, NOT Supabase.** Migrations go in `src/lib/db.ts` versioned by schema_version, not `supabase/migrations/*.sql`. Codex moved heartbeat + comments + decomposer onto Turso schema V45. Future migrations use the same path.

## Codex audit (2026-05-10)

Full project audit at `~/Documents/Codex/2026-05-09/familiarize-yourself-with-all-code-on/device-project-audit.md`. Key findings:

- 40 code roots scanned
- GitHub auth: `Glomskib` ✓
- Vercel CLI installed but not logged in (CLI gap; connector works)
- 2 open FF PRs: #14 (pnpm standardization), #8 (Vercel Web Analytics)
- FF dep drift: lockfile transition + tracked browser-service/auth-state.json (security)
- Zebby's split into canonical new app + legacy ZebbyBrain
- HHH Shopify theme NOT in git (two duplicate copies)
- BuybackOS strongest reusable foundation, may power TCG
- Taskmesh overlaps MC, fold or archive

## Recommended finish order (per Codex audit)

1. ~~MC deploy unblocked~~ ✓ DONE
2. MC security/deploy scripts + queue visibility
3. FF dependency cleanup + remove tracked auth state + add health SHA *(Codex on this lane)*
4. Zebby's canonical path + install/build + safety rails
5. HHH Shopify theme into git + payment-ready
6. Pick TCG vs BuybackOS commerce engine, stop parallel drift
7. Fold Taskmesh + Fleet Mailbox into MC

## Lanes (24/7 sprint, Brandon directive 2026-05-10)

- **Codex:** FlashFlow build cleanup, dependency lockfile, /api/health SHA, push the 3 ahead commits
- **Claude:** Monday-style MC Phase 1 (#139), HHH/MMM coordination, Context folder updates
- **Mini (fleet):** HHH 2026 sponsor contact research + FB content next 30 days (briefs already queued)
- **mbp-2 (fleet):** ramp up — bootstrap pending
- **HP (fleet):** Playwright tasks pending OpenSSH enable

## Standing initiatives — pick from these

- **#139 Monday-style MC Phase 1** — colored status/priority pills, inline-edit cells, grouped collapsible sections w/ summary bar, top toolbar, assignee picker, file upload, /admin/board landing
- **HHH 2026 sponsor outreach** — 25 first-touch drafts at `Mac Takeover/HHH-2026-SPONSOR-OUTREACH-25.md`. Mini brief: contact discovery
- **HHH FB content next 30 days** — June 8 → July 7. Mini brief queued
- **HHH Shopify theme** — into git, payment-ready audit (#102), wrong-event-identity already fixed
- **MMM hub copy + photo pass** (#83), tone rewrite (#103), membership tiers + Stripe (#109)
- **MMM Flyer Studio** white-label (#117), domain forwarding fix (#116)
- **Zebby's** landing v2 (#81), spoonie-native chat depth, safety rails for clinical content
- **TCG Buying Group Phase 1** — operator dashboard + ledger (#84), transparency engine (#65)
- **FF acquisition pack** first 10 users (#88), email sequences (#90), homepage rebuild (#124)

## Hands-off — Brandon decides, AI drafts only

- HHH event-day operations (route, day-of staffing, vendor logistics)
- Zebby's clinical/medical content — gates on Brandon AND Katlyn
- Pricing on net-new products
- Brand voice changes

## Open decisions waiting on Brandon

See `10-DECISIONS.md`. Core ones:
- Auto-deploy permissions matrix (GREEN/YELLOW/RED defaults)
- Telegram thread routing (Test Queue, daily digest, fleet alerts)
- Daily 7am ET digest (keep / move / kill)
- Per-venture pricing (HHH entry fees, MMM tiers, FF Pro, TCG fee, digital asset)

---

*Append-only auto-updates below this line.*
