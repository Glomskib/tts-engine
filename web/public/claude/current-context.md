---
name: CURRENT_CONTEXT_PACK
generated: 2026-06-02 04:31 EDT
regenerate_via: scripts/memory/compile-current-context.sh
---

# Brandon's Current Context Pack

**Date:** 2026-06-02
**Operator:** Brandon Glomski — Findlay, OH

## Latest shipped proof (last 10)

- **2026-05-23 22:50 UTC** [Bolt] — Authored `fix-bolt-poll-task-id-apply-v2.command` fixing v1 bugs (grep -q sentinel, correct label `com.openclaw.bolt-poll`, correct log path `~/openclaw-workspace/logs/bolt-poll-YYYYMMDD.log`, precise sed-line pattern matching). Fired it. Result: pattern matched 0 times → script correctly REFUSED to patch + exited cleanly with backup intact. Surfaced that the current bolt-poll.sh on mini doesn't match the install-bolt-polling.command template anymore.
- **2026-05-23 22:53 UTC** [Bolt] — Authored + fired `inspect-bolt-poll-current.command`. Read-only ground-truth dump. **Major findings:**
- **2026-05-23 22:55 UTC** [Decision packet] — `10-Projects/_decision-packets/2026-05-23-bolt-poll-vs-mc-poller.md` — Brandon must pick one of 4 phrases (retire / restore-both / restore-only / investigate-mc-first). The "fix bolt-poll empty TASK_ID" priority Brandon set 4 prompts ago is now blocked on this architectural decision because the file is corrupted AND the daemon isn't loaded.
- **2026-05-23 23:07 UTC** [Discovery] — Fired `discover-fleet-truth.command`. Got: mini user is `brandonglomski` not `makingmilesmatter`; mini hostname is `Mac.lan`; tailscale CLI not on mini (GUI only); mc-poller plist + script + log path captured; bolt-poll plist was already disabled by Brandon on 2026-05-03 as `.killed-1777865185`; mc-poller is actively ticking every 60s for `bolt-mini` agent identity; queue is empty (idle, not backlogged); `.hp-1-status.json` exists (HP did report status as recently as May 11).
- **2026-05-23 23:11 UTC** [Decision] — bolt-poll vs mc-poller decision packet RESOLVED. Brandon delegated to AI judgment. Option A picked: retire bolt-poll, mc-poller is canonical.
- **2026-05-23 23:11 UTC** [Bolt retirement] — Fired `retire-bolt-poll-and-fix-ssh.command`. Result:
- **2026-05-23 23:13 UTC** [SSH aliases] — Fired `fix-ssh-aliases-v2-tailnet-reality.command`. Result:
- **2026-05-23 23:14 UTC** [Vault docs] — Authored:
- **2026-05-23 23:14 UTC** [Constraint adherence] — Zero hard-rule actions taken outside scope: no DNS, no Stripe, no Shopify, no email-sends, no PR merges, no production deploys, no live customer/sponsor contact. Email allowlist (§5b) unbroken. All work was internal fleet hygiene + documentation.
- **2026-06-02 04:31 EDT** [FlashFlow] — Audited Claude's FlashFlow launch ship and deployed fixes for TypeScript, homepage nav, video-engine modes, and avatar TikTok posting

## Active projects

| Project | Status updated | One-line state |
|---|---|---|
| BuyBackOS | 2026-05-10 | ⚠ STALE (22 days) — **State:** Multi-tenant shell on mini. TCG Life code package ready to install as first tenant. Phase 3 E2E validation in |
| FFF | 2026-05-10 | ⚠ STALE (23 days) — **State:** UNKNOWN — project identity not confirmed. |
| Faire-Dropship | 2026-05-10 | ⚠ STALE (23 days) — **State:** Opportunity brief drafted. Awaiting Brandon's greenlight on Play 1 (Cozy Cause Co). |
| FlashFlow | 2026-06-02 | **State:** Shipping core upload + auth fixes. TUS resumable upload path live; login button visible on nav. Verifying dep |
| HHH-2026-approval-room-2026-05-22-195750 | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026-approval-room-2026-05-24-223741 | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026-approval-room-2026-05-25-081037 | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026-approval-room-2026-05-25-084037 | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026-facebook-clean-v2-assets | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026-facebook-local-candidate-review-set-2026-05-17-091305 | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026-route-assets-inbox | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026-route-logistics-request-review-2026-05-22-192544 | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026-sponsor-test-batch-1-review | _no CURRENT_STATUS.md_ | TODO — create status file |
| HHH-2026 | 2026-05-10 | ⚠ STALE (23 days) — **State:** Sponsor outreach week. Pitch deck + volunteer plan + day-of comms drafted. Shopify product setup packet + pay |
| HHH-MC-Clients | 2026-05-20 | **State:** Conceptual + half-spec'd. No standalone codebase yet — the product currently lives as a "workspaces" featur |
| Liquidation-Decision-Engine | 2026-05-10 | ⚠ STALE (23 days) — **State:** Research stage. No active build. |
| MMM-Hub | 2026-05-10 | ⚠ STALE (23 days) — **State:** Hub copy rewritten this week. Get-Involved page needs Brandon's 5 stat numbers. Photo replacement list drafte |
| MMM | _no CURRENT_STATUS.md_ | TODO — create status file |
| Mission-Control | 2026-05-10 | ⚠ STALE (23 days) — **State:** Phase 1 Monday-style UI shipped. /admin/brief composer live. CRM Personal Connection tag shipping (schema v47 |
| PT-Link-Findlay | _no CURRENT_STATUS.md_ | TODO — create status file |
| PT-Link | 2026-05-10 | ⚠ STALE (22 days) — **State:** Plan drafted. Brandon's decision needed on whether to pitch Terry. If yes: pilot Plays 1 + 3. |
| PorchLight-AI | 2026-05-10 | ⚠ STALE (23 days) — **State:** Backlog. Blocked on deploy token. |
| TCG-Life | 2026-05-15 | ⚠ STALE (18 days) — **State:** Live for first-member signups. Public landing + Stripe Payment Link both shipped. Webhook + idempotency + sch |
| TCG-Scan-Pro | 2026-05-10 | ⚠ STALE (23 days) — **State:** UNKNOWN — defers to TCG Life pipe. |
| Zebbys-World | 2026-05-10 | ⚠ STALE (23 days) — **State:** Landing live. Deferred this week — HHH/MMM is priority. App subdomain decision locked 2026-05-10. |
| _decision-packets | _no CURRENT_STATUS.md_ | TODO — create status file |
| _reports | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-gumroad-draft-prep-2026-05-21-200031 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-gumroad-draft-prep-2026-05-24-220825 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-gumroad-draft-prep-2026-05-24-220854 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-gumroad-draft-prep-2026-05-25-121117 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-launch-room-2026-05-23-170641 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-launch-room-2026-05-24-220903 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-launch-room-2026-05-25-074055 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-launch-room-2026-05-25-121123 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-storefront-preview-2026-05-21-095503 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-storefront-preview-2026-05-24-220821 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-asset-storefront-preview-2026-05-25-121115 | _no CURRENT_STATUS.md_ | TODO — create status file |
| digital-assets | _no CURRENT_STATUS.md_ | TODO — create status file |
| local-biz-engine-2026-06-01 | _no CURRENT_STATUS.md_ | TODO — create status file |
| mission-control-phase1-qa-2026-05-21-122616 | _no CURRENT_STATUS.md_ | TODO — create status file |
| mission-control-phase1-qa-2026-05-21-122700 | _no CURRENT_STATUS.md_ | TODO — create status file |
| mission-control-phase1-qa-2026-05-25-070915 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-102510 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-102828 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-155551 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-172643 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-175758 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-200217 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-203124 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-204221 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-205916 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-213330 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-21-220543 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-22-103513 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-22-184633 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-22-185836 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-22-192951 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-22-200021 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-23-163237 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-23-163526 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-23-180203 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-23-180232 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-23-220347 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-23-220412 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-23-220704 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-24-010223 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-24-213745 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-24-230848 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-25-131208 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-25-141124 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-25-171332 | _no CURRENT_STATUS.md_ | TODO — create status file |
| this-week-approval-cockpit-2026-05-25-171650 | _no CURRENT_STATUS.md_ | TODO — create status file |
| weak-site-funnel-2026-06-01 | _no CURRENT_STATUS.md_ | TODO — create status file |

## Top next actions (across projects)

### BuyBackOS
1. Build + fire `install-tcg-life-on-mini.command` — SSH'd install of TCG Life drop-in package onto mini's BuyBackOS clone.
2. Pull latest commit log from mini's `~/buybackos` and populate this folder's SHIPPED_LOG.md.
3. Confirm production URL + deploy target with Brandon, update PROJECT_CONTEXT.md.

### FFF
1. UNKNOWN — needs Brandon to confirm what FFF stands for and what the project is.

### Faire-Dropship
1. Brandon greenlights Play 1 (Cozy Cause Co) — go / no-go decision.
2. If go — I build brand kit (logo, colors, tagline, voice doc, IG/TikTok bio).
3. Build initial Faire order list (≤ $6k, optimized for TikTok-Shop velocity + cause alignment).

### FlashFlow
1. Verify ship-ff-tus-and-nav.command deploy — /api/health SHA must match git HEAD.
2. Audit Stripe public product names on flashflowai.com — fix any showing "Zebby's World LLC" instead of "FlashFlow."
3. Draft + ship minimum-sellable onboarding flow (signup → first upload → first render).

### HHH-2026
1. Send first-touch to 25 cold sponsor prospects (from `HHH-2026-sponsor-prospects.md`) via miles@makingmilesmatter.com — test to brandon@ + spiderbuttons@ first.
2. Convert HHH sponsor pitch deck markdown → branded PDF (use sponsor-facing letterhead).
3. Audit live HHH Shopify store — confirm it no longer says "Hocking Hills" anywhere; fix and push.

### HHH-MC-Clients
1. **Pick the canonical product name.** Working candidates: HHH MC for Clients, Nonprofit Starter, MMM Event OS, Event Ops MC, something new. Affects domain pick, repo name, sales copy, every future reference.
2. **Decide: extract from operator MC, or keep as `workspaces` feature inside it?** Current bias is keep-as-workspaces (per HHH-Chat-Bot-Spec §6 "no special-casing"). If extracting, requires a repo split plan. Lock this before any more code lands.
3. **Decide: revive or archive the legacy `nonprofit-starter` repo?** It exists (`github.com/Glomskib/nonprofit-starter`) but isn't the canonical home. Confirm one way or the other.

### Liquidation-Decision-Engine
1. Confirm with Brandon: standalone product OR module inside BuyBackOS / LiquidationOS?
2. Cross-reference `Launch-pack-LiquidationOS-v2.md` (parent dir) — is that this project?
3. UNKNOWN — needs Brandon to confirm whether to unfreeze research or defer until P1 revenue ships.

### MMM-Hub
1. Get Brandon's 5 Get-Involved stats (riders, volunteers, dollars raised, miles, brag stat) — then push copy live.
2. Forward Tim + Josh founder interview texts (drafted, awaiting Brandon).
3. Push approved hub copy rewrite live on makingmilesmatter.org (Shopify).

### Mission-Control
1. Drop MC token at `~/.config/mc/token` on each fleet device so brief-sync agent stops 401'ing.
2. Build /admin/memory page — surface this Memory OS structure as a UI tab.
3. Verify ship-mc-crm-connection-tag.command lands on mc.flashflowai.com — /api/health SHA must match HEAD.

### PT-Link
1. Brandon decides: pitch Terry this week, or hold until after HHH sponsor wave.
2. If yes — adapt pitch script for Terry's voice, schedule the conversation (1 hr).
3. If pitch lands — scope Pilot Play 1 (intake/scheduling automation) as a 1-week build.

### PorchLight-AI
1. Get deploy token from Brandon (or generate new one in Expo + Vercel dashboards) — unblock first deploy.
2. Confirm repo path + mount on MBP1.
3. Audit current Expo app state — what builds, what doesn't, what's deploy-ready.

### TCG-Life
1. Build + fire `install-tcg-life-on-mini.command` — SSH'd install of `tcg-life-phase1/` package onto mini's BuyBackOS clone.
2. Run TCG Life migration on BuyBackOS tenant DB; confirm schema is live.
3. Wire Stripe Price `price_1TVj8WKXraIWnC5DvDrfgUXF` checkout into BuyBackOS member-signup flow.

### TCG-Scan-Pro
1. UNKNOWN — needs Brandon to confirm current scope: backlog vs. paused vs. ready-to-ship.
2. Confirm repo path + Flutter app current state (build status, app store status).
3. Wire TCGplayer + eBay affiliate flow (status currently "pending" per memory).

### Zebbys-World
1. Confirm app repo path with Brandon, mount on MBP1.
2. Stand up `app.zebbysworld.com` subdomain — DNS + Vercel project skeleton.
3. Scope EDS-aware chat MVP: spoon theory mode, validation tone, doctor-prep mode, RAG over EDS Society corpus.

## Recent decisions (last 5)

- [HHH-MC-Clients] ## Decisions that need to be made (NOT locked yet)


## Where to find deeper docs

- **Operator profile:** `00-System/BRANDON_OPERATOR_PROFILE.md`
- **AI working rules:** `00-System/AI_WORKING_RULES.md`
- **Tool handoff protocol:** `00-System/TOOL_HANDOFF_PROTOCOL.md`
- **Memory conflict rules:** `00-System/MEMORY_CONFLICT_RULES.md`
- **Fleet SOP:** `00-System/FLEET-SOP.md`
- **Fleet architecture:** `00-System/FLEET-ARCHITECTURE.md`
- **Per-project status:** `10-Projects/[ProjectName]/CURRENT_STATUS.md`
- **Shipped proof log:** `40-Receipts/shipped-proof-log.md`

## Source-of-truth hierarchy

1. Latest direct Brandon instruction
2. THIS file
3. Project CURRENT_STATUS.md
4. Project DECISIONS.md
5. Project SHIPPED_LOG.md
6. Older vault notes
7. LLM trained memory

Newer shipped proof beats older plans. If unsure, mark UNKNOWN.

---

_Last regenerated: 2026-06-02 04:31 EDT_
