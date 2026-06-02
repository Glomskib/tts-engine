---
name: shipped-proof-log
purpose: Global append-only log of shipped work across all projects. Newest at bottom.
last_seeded: 2026-05-10
---

# Shipped Proof Log

This file is append-only. Use `scripts/memory/write-work-receipt.sh` after every shipped piece of work — it writes here, to the project SHIPPED_LOG.md, and updates CURRENT_STATUS.md + the context pack.

## Seed entries (2026-05-10 session)

- **2026-05-10** [Mission Control] — Phase 1 Monday-style overhaul shipped (`b1ad9da`) — pills, grouped view, /admin/board, toolbar, file upload, workspace filter, row assignee, live bookshelf counts. Live at mc.flashflowai.com.
- **2026-05-10** [Mission Control] — /admin/brief composer + fleet_briefs schema v46 shipped (`9fd692b`). Live at mc.flashflowai.com/admin/brief.
- **2026-05-10** [Mission Control] — CRM Personal Connection tag schema v47 shipped (`988738e` — deploy verifying).
- **2026-05-10** [TCG Life] — Stripe Product + $50/mo Price created on Zebby's World account (`prod_UUiZmCHski0wk9` / `price_1TVj8WKXraIWnC5DvDrfgUXF`).
- **2026-05-10** [Fleet Mailbox] — Relayed 13 queued fleet briefs from MBP1 → mini's bare repo (`ddb30a4`).
- **2026-05-10** [Fleet] — Patched 4 LaunchAgents on MBP1 (log path fix — root cause of `agents.stale_4h=8`). Watcher logs now under `~/Library/Logs/fleet-mailbox/`.
- **2026-05-10** [MBP1 Hardware] — 2TB external SSD reformatted NTFS → 4 encrypted APFS volumes (MBP1-Working, MBP1-Backups, MBP1-Renders, MBP1-Archive). FileVault password set.
- **2026-05-10** [MBP1 Hardware] — Time Machine pointed at MBP1-Backups + nightly vault snapshot LaunchAgent installed (3:30 AM daily).
- **2026-05-10** [MBP1 Hardware] — Downloads cleanup: ~1.2 GB freed from boot disk, archived to MBP1-Archive.
- **2026-05-10** [Vault / Memory OS] — Created `00-System/FLEET-SOP.md` (263 lines) + `FLEET-ARCHITECTURE.md` (218 lines).
- **2026-05-10** [HHH 2026] — Sponsor pitch deck markdown drafted (248 lines, PDF-ready).
- **2026-05-10** [HHH 2026] — Volunteer recruitment email + 33-volunteer placement plan + day-of comms templates drafted.
- **2026-05-10** [HHH 2026] — Rider/Volunteer chat bot product spec drafted (430 lines, white-label sellable).
- **2026-05-10** [MMM Hub] — Homepage / about / sponsor page / membership tier copy rewrite drafted (484 lines, production-ready code blocks).
- **2026-05-10** [Faire Dropship] — $6k opportunity brief drafted (304 lines, 3 ranked plays).
- **2026-05-10** [PT Link] — AI optimization plan drafted (613 lines, 8 plays + ROI math + pitch script + productization path).
- **2026-05-10** [Vault / Memory OS] — Canonical Memory OS files written: `BRANDON_OPERATOR_PROFILE.md`, `CURRENT_CONTEXT_PACK.md`, `AI_WORKING_RULES.md`, `TOOL_HANDOFF_PROTOCOL.md`, `MEMORY_CONFLICT_RULES.md`, `START_NEW_AI_SESSION.md`. Scripts: `compile-current-context.sh`, `bootstrap-session.sh`, `write-work-receipt.sh`.

---

_New entries appended below by `scripts/memory/write-work-receipt.sh`._

## 2026-05-11 — MC Batch 3+4+Dispatch+/phone+Memory OS extensions (a3ad9c2)

- **2026-05-11 10:42 ET** [Mission Control] — **MC Batch 3 + 4 + Dispatch + /phone + cron email extensions shipped** as a single commit (`a3ad9c2`) — schema v47 → v50.
  - New pages: `/admin/fleet-manager`, `/admin/goals`, `/admin/memory`, `/admin/dispatch`, `/phone`
  - Schema v49: extended `agent_instances` with device, owner, permission_level (L1-L5), instructions, allowed_tools
  - Schema v50: new `goals` table seeded with 6 starter OKRs (HHH 400 riders, HHH $28k, FF MRR $1k, TCG Life 25 members, MMM 5 headline sponsors, 5k miles)
  - Cron endpoints `/api/cron/chief-morning-brief` + `/api/cron/chief-evening-recap` now dual-deliver Telegram + email (Resend → brandon@makingmilesmatter.com, MMM amber/teal header bars, plain-text + HTML)
  - Sidebar locked order: Operate → Agents → CRM & Comms → Money → Brain → Client Work. Dispatch + Fleet Manager + Goals + Memory all NEW-badged.
  - Full re-skin sweep: 140+ admin pages onto new design tokens. Legacy chrome (Nav, MainShell, SidebarToggleButton) stubbed throw-on-import. NEXT_PUBLIC_NEW_DESIGN default-on.
  - Live at mc.flashflowai.com — schema_version: 50 verified at 14:43 UTC.
- **2026-05-11 10:42 ET** [Fleet] — **18 fleet briefs relayed to mini's bare repo** including mbp-2 watcher log-path fix, openclaw-workspace README, Archive5TB library setup, sponsor outreach test emails. Each tagged for its target device; watchers will claim on next 60s tick.
- **2026-05-11** [Memory OS] — Disabled 2 broken Cowork scheduled tasks (`brandon-morning-brief` POSTed to webhook receiver instead of sender; `flashflow-daily-brief` wrote to disk only). Real morning brief is Vercel cron at `/api/cron/chief-morning-brief` firing daily 12 UTC.
- **2026-05-11** [Memory OS] — OpenClaw + Hermes audit doc landed at `vault/00-System/OPENCLAW-HERMES-AUDIT-2026-05-11.md`. Net: zero deletions, zero renames. Vault README updated with name mapping.
- **2026-05-11** [HHH 2026] — Sponsor pitch deck PDF regenerated with locked Year One stats: 202 riders, 12k miles, $14k raised, 6 partners, 3 volunteers (needed 15). "Year One Honest" teal callout added.
- **2026-05-11** [FlashFlow] — FF prod at 2a513323 (YT page repositioned as Transcriber + dead link audit).
- **2026-05-11** [MC] — `/admin/dispatch` page now shows all 9 Vercel crons with last-fire times + Fire-now buttons. Directly addresses Brandon's "Dispatch isn't working" complaint.
- **2026-05-11** [MC] — `/phone` mobile-first one-screen dashboard built — fleet dot, 3 KPI tiles (HHH days, active bots, queued), today's dispatch list, 4 action buttons (Send brief / Talk to Bot A / What shipped / Sponsor pipeline). Optimized for ~390-414px viewports.
- **2026-05-11** [MC] — Batch 5 Headless Operator plan drafted at `vault/10-Projects/Mission-Control/MC-Batch-5-Headless-Operator-Plan-2026-05-11.md`. Three migrations: 5A operator on Vercel, 5B mini becomes relay, 5C /phone (last one shipped already). Awaiting Brandon greenlight on 5A.

## 2026-05-11 — HHH/MMM volunteer + sponsor public funnels (0faa621 → d1c5dfb)

- **2026-05-11 11:43 ET** [Mission Control] — **HHH 2026 volunteer + sponsor public funnels shipped** as `0faa621`, schema v50 → v52.
  - Schema v51: `hhh_volunteers` table (slot, shift, shirt size, dietary, status, source) + unique index on (email, event_year)
  - Schema v52: `hhh_sponsor_leads` table (tier_interest, status, source_url, UTMs, converted_sponsor_id)
- **2026-05-11** [HHH] — **Public volunteer signup at `/volunteer/hhh-2026`** — 7 slot picks (registration, rest stops N/S, sag wagon, finish line, after-party, flex) + shift + shirt + dietary + sponsor-team tag. Posts to `/api/hhh/volunteers` which inserts + sends MMM-amber confirmation email + notifies miles@.
- **2026-05-11** [HHH] — **Public sponsor landing at `/sponsor/hhh-2026`** — hero + 4-tier comparison cards (Headline/Contributing/Supporting/In-Kind) + 5 year-one stats + calendar urgency + lock-me-in form. Each tier card has a "Lock in" button that pre-fills the form. Posts to `/api/hhh/sponsor-leads`.
- **2026-05-11** [MC] — **Admin pipelines: `/admin/hhh/volunteers`** (per-slot fill bars vs target, KPI strip, full table) and **`/admin/hhh/sponsor-leads`** (pipeline $ value calculation, status pills, by-tier breakdown).
- **2026-05-11 14:13 ET** [MC] — **Middleware fix shipped at `d1c5dfb`** — /volunteer/ + /sponsor/ + /api/hhh/volunteers + /api/hhh/sponsor-leads added to PUBLIC_PATHS so anonymous prospects can hit them. Verified: pages return 200, POST endpoints validate required fields, GET endpoints still enforce admin auth.
- **2026-05-11** [MC] — **`/admin/hhh` HHH 2026 Command Center hub** — countdown + 6 KPIs (days/riders/sponsor leads/sponsors won/pipeline $/volunteers) + 4 HubCards with admin + public deep-links + 4 quick actions.
- **2026-05-11** [Vault] — **HHH rider re-engagement sequence** (3 emails) at `vault/10-Projects/HHH-2026/rider-reengagement/SEQUENCE.md` — covers "We're back" + "Routes locked" + "Spots filling" with merge-variable placeholders, sender = miles@, tone notes.
- **2026-05-11** [Vault] — **HHH 2026 social media calendar** at `vault/10-Projects/HHH-2026/social-media-calendar/CALENDAR.md` — 16 weeks, ~48 posts, 3/week (Mon/Wed/Fri), 8 post types, per-week schedule with topics + CTAs.
- **2026-05-11** [Vault] — **HHH May 12 launch post** at `vault/10-Projects/HHH-2026/social-media-calendar/post-2026-05-12-launch.md` — Instagram feed + Stories (3 frames) + Facebook (with longer story) + Strava + DM template + 7am→9am→12pm posting order.
- **2026-05-11** [Vault] — **HHH sponsor outreach send schedule** at `vault/10-Projects/HHH-2026/sponsor-outreach/SEND-SCHEDULE.md` — 5/day × 5 weeks, ordering by tier value, follow-up template, week-over-week target table.
- **2026-05-11** [Memory] — `feedback_sandbox_cannot_git.md` — saved hard-won lesson that workspace bash sandbox can't run git operations (mount blocks unlink). All ship work must use `.command` files fired via Finder double-click.

## 2026-05-15 — Memory OS live + FF perfection pass + HHH outreach prep

- **2026-05-15** [MC] — `/admin/memory` Memory OS fixed for Vercel — added `public/memory/snapshot.json` fallback when local vault unreachable. Commit `3f9f93a`. Schema unchanged.
- **2026-05-15** [MC] — **Always-live brain shipped at `d915c07`** — schema v60 `memory_snapshot` table, `POST /api/admin/memory/snapshot` agent endpoint, async live read variants in `memory-os.ts`, "Live snapshot — pushed N min ago from <host>" badge on /admin/memory, snapshot pusher daemon (`scripts/push-memory-snapshot.ts`), launchd plist + one-touch installer.
- **2026-05-15** [MC] — `555439a` — `/api/admin/memory/snapshot` accepts either MC token (admin or agent).
- **2026-05-15** [MC] — `0dad20e` — install-mc-memory-pusher.command auto-pulls token from Vercel via `vercel env pull`. `auth.ts` trims candidate tokens to ignore trailing newlines.
- **2026-05-15** [MC] — `90686ef` — launchd plist resolves npx path at install time (was failing on nvm assumption). Recurring 5-min cron now healthy.
- **2026-05-15** [MBP1] — `install-mc-memory-pusher.command` installed. Snapshot pushes from Brandons-MacBook-Pro.local every 5 min. Memory OS is always-live. Log at `~/Library/Logs/mc-memory-pusher.log`.
- **2026-05-15** [Vault] — `00-System/AUDIT-projects-vs-MC-2026-05-15.md` — every project's MC connection + readiness % + single next gate.
- **2026-05-15** [Vault] — `10-Projects/FlashFlow/PERFECTION-PLAN-2026-05-15.md` — 4-tier prioritized fix list. Reality-checked: most "to-do" items were already shipped; 4 genuine 🟥 unshipped items remain.
- **2026-05-15** [Vault] — `10-Projects/FlashFlow/API-MONETIZATION-MEMO-2026-05-15.md` — recommendation: ship public API. ~3-4 month break-even on direct revenue alone; LLM-ecosystem distribution is the strategic moat.
- **2026-05-15** [Vault] — `10-Projects/HHH-2026/SPONSOR-PITCH-DECK-REWRITE-BRIEF.md` + MC task `bd7c51d1` assigned to brett-growth, P0, due 2026-05-19.
- **2026-05-15** [Vault] — `10-Projects/HHH-2026/HHH-2026-Sponsor-Pitch-Deck-v2.md` — numbers-first rewrite. Page 1 numbers + ask, Page 2 tier table with Stripe Payment Links inline, Page 3 money allocation, Page 4 brief story, Page 5 commit options. Two TODOs flagged.
- **2026-05-15** [Vault] — All 25 sponsor cold-email drafts in `10-Projects/HHH-2026/sponsor-outreach/` patched to include tier-appropriate Stripe Payment Link P.S. Prospects can now pay in 60 seconds without back-and-forth.
- **2026-05-15** [Vault] — `10-Projects/TCG-Life/CURRENT_STATUS.md` corrected — TCG-Life landing was already live; first-member signups are unblocked today.
- **2026-05-15** [FF] — Tier-1 perfection pass STAGED in `~/tts-engine/ship-ff-tier1-perfection-pass.command` — 7 files: PINNED + CREATE renamed to "AI Video Editor", new Flagship badge with gradient styling, "Auto Edit" buttons → "AI Video Editor", retake-detection rule in edit-plan prompt, new RenderAgentBadge component mounted in /create header.

## 2026-05-23 — Revenue-ops pivot session (claude-cowork-mbp)

- **2026-05-23 22:30 UTC** [Rules] — AI_WORKING_RULES.md updated with §5b (send-recipient allowlist: brandon@makingmilesmatter.com + spiderbuttons@gmail.com only without separate approval). §5 confirm list extended to include external-platform draft creation. Per direct Brandon instruction.
- **2026-05-23 22:30 UTC** [Vault / Brain v2] — Added `00-System/templates/{decision-packet.md, diagnostic-intake.md, README.md}` — the two real format gaps in the existing vault. Decision-packet template directly addresses Brandon's "convert approval gates into one-page decision packets" priority.
- **2026-05-23 22:30 UTC** [Vault / Handoffs] — `handoffs/README.md` + `handoffs/LATEST.md` (auto-generated pointer) + `Command-Center/update-handoff-latest.command`. Verified: LATEST.md correctly points at this session's handoff with a 40-line preview + last-10 handoffs list.
- **2026-05-23 22:30 UTC** [Vault / Decision packets] — `10-Projects/_decision-packets/` folder created with `README.md` + 3 OPEN packets: digital-asset Gumroad draft, MMM org → MMM Hub DNS, HHH sponsor test batch (to brandon@ only, per §5b). All use the new template format.
- **2026-05-23 22:30 UTC** [Fleet / Mac Takeover] — 5 new .command files staged and chmod +x:
  - `fix-bolt-poll-task-id-apply.command` — real idempotent patch for the empty-TASK_ID bug, supersedes diagnostic-only `fix-bolt-task-id-parse.command`
  - `install-fleet-watcher-hp.command` — stages PowerShell bundle for HP 360 (mirrors mac LaunchAgent watcher per FLEET-SOP §2)
  - `install-fleet-monitor-thinkpad.command` — stages PowerShell bundle for ThinkPad L1 monitor (alerts only TELEGRAM_CHIEF_CHAT_ID; refuses to send if env missing)
  - `add-ssh-aliases-fleet.command` — idempotent ~/.ssh/config additions for mbp-2, hp, thinkpad
  - `verify-mbp2-watcher.command` — read-only SSH probe answering the open question from CURRENT_CONTEXT_PACK line 58
- **2026-05-23 22:30 UTC** [Vault / Reports] — `10-Projects/_reports/session-report-2026-05-23-revenue-ops-pivot.md` — six-section report Brandon spec'd (working / broken / blocked-by-Brandon / safely-fixed / per-machine / next-5-actions).
- **2026-05-23 22:30 UTC** [Diagnosis] — Daily brief stoppage diagnosed: Cowork-side scheduled tasks correctly disabled 2026-05-11 (verified via `mcp__scheduled-tasks__list_scheduled_tasks`). Real failure is Vercel cron `/api/cron/chief-morning-brief` or its delivery channel. 30-second confirm path: `mc.flashflowai.com/admin/dispatch` last-fire time. Awaiting Brandon to check.
- **2026-05-23 22:30 UTC** [Constraint] — Hard rules respected: zero DNS / Stripe / Shopify / email-send / PR merge / production / external-platform-create actions fired this session. Every irreversible step is a decision packet Brandon approves.

Session handoff: `handoffs/2026-05-23T22-30-00Z-claude-cowork-mbp.md`

## 2026-05-23 — Revenue-ops pivot session, firing phase (claude-cowork-mbp via Computer Use)

- **2026-05-23 22:42 UTC** [Fleet] — Fired `add-ssh-aliases-fleet.command` via Finder double-click + Computer Use. Result: ✅ added mbp-2 + thinkpad to `~/.ssh/config` (hp already present). Connectivity probe: all 3 unreachable (first manual SSH needed for auth). Log: `Command-Center/add-ssh-aliases-fleet.log`.
- **2026-05-23 22:45 UTC** [Fleet] — Fired `verify-mbp2-watcher.command`. Result: SSH failed with `Could not resolve hostname brandons-mpb-2.tail5646cc.ts.net`. Real finding: MagicDNS isn't resolving that hostname (or the hostname is wrong). Same will likely happen for hp + thinkpad. Worth noting: mini SSH works fine, so Tailscale itself is up — just these 3 hostnames are unresolvable.
- **2026-05-23 22:46 UTC** [Bolt] — Fired `fix-bolt-poll-task-id-apply.command` (v1). SSH to mini worked. Sentinel check returned false positive ("already patched" when not), so script SKIPPED patch + restarted wrong launchd label (`com.openclaw.stale-task-archive` instead of `com.openclaw.bolt-poll`). No file modifications applied. Backup created at `~/openclaw-workspace/bin/bolt-poll.sh.bak.20260523185046`.
- **2026-05-23 22:50 UTC** [Bolt] — Authored `fix-bolt-poll-task-id-apply-v2.command` fixing v1 bugs (grep -q sentinel, correct label `com.openclaw.bolt-poll`, correct log path `~/openclaw-workspace/logs/bolt-poll-YYYYMMDD.log`, precise sed-line pattern matching). Fired it. Result: pattern matched 0 times → script correctly REFUSED to patch + exited cleanly with backup intact. Surfaced that the current bolt-poll.sh on mini doesn't match the install-bolt-polling.command template anymore.
- **2026-05-23 22:53 UTC** [Bolt] — Authored + fired `inspect-bolt-poll-current.command`. Read-only ground-truth dump. **Major findings:**
  - `bolt-poll.sh` is CORRUPTED. Line 25 is `TASK_ID=` (empty assignment). Line 26 is `[ -z "" ] && exit 0  # nothing claimed... ` (always-true guard → unconditional exit after claim). Caused by a botched patch on 2026-05-01 (bak.fix.* files dated then).
  - `com.openclaw.bolt-poll` is NOT loaded in launchd. Loaded openclaw jobs: `stale-task-archive`, `mc-poller`, `gateway`, `daily-brief`.
  - Bolt heartbeat is stamped 2026-05-04T03:25:51Z — 3 weeks stale.
  - Clean pre-corruption backup exists at `~/openclaw-workspace/bin/bolt-poll.sh.bak.20260501184057` (7219 bytes).
  - Discovered mini's username is `brandonglomski` (the existing mini SSH alias must already be configured for this; the new mbp-2/hp/thinkpad aliases I added use `makingmilesmatter` which may be wrong).
- **2026-05-23 22:55 UTC** [Decision packet] — `10-Projects/_decision-packets/2026-05-23-bolt-poll-vs-mc-poller.md` — Brandon must pick one of 4 phrases (retire / restore-both / restore-only / investigate-mc-first). The "fix bolt-poll empty TASK_ID" priority Brandon set 4 prompts ago is now blocked on this architectural decision because the file is corrupted AND the daemon isn't loaded.

Session handoff (firing phase): `handoffs/2026-05-23T23-00-00Z-claude-cowork-mbp-firing.md`

## 2026-05-23 — Long-term hygiene pass (claude-cowork-mbp via Computer Use)

Triggered by Brandon: "Do what is best to get things running right long term. I trust your judgement."

- **2026-05-23 23:07 UTC** [Discovery] — Fired `discover-fleet-truth.command`. Got: mini user is `brandonglomski` not `makingmilesmatter`; mini hostname is `Mac.lan`; tailscale CLI not on mini (GUI only); mc-poller plist + script + log path captured; bolt-poll plist was already disabled by Brandon on 2026-05-03 as `.killed-1777865185`; mc-poller is actively ticking every 60s for `bolt-mini` agent identity; queue is empty (idle, not backlogged); `.hp-1-status.json` exists (HP did report status as recently as May 11).
- **2026-05-23 23:11 UTC** [Decision] — bolt-poll vs mc-poller decision packet RESOLVED. Brandon delegated to AI judgment. Option A picked: retire bolt-poll, mc-poller is canonical.
- **2026-05-23 23:11 UTC** [Bolt retirement] — Fired `retire-bolt-poll-and-fix-ssh.command`. Result:
  - 7 files (bolt-poll.sh + 6 backups) moved from `~/openclaw-workspace/bin/` to `~/openclaw-workspace/archive/2026-05-23-bolt-poll-retirement/` on mini
  - `com.openclaw.bolt-poll.plist.killed-1777865185` moved from `~/Library/LaunchAgents/` to the same archive
  - `RETIREMENT-NOTE.md` written in archive folder explaining what was retired and how to revive
  - mc-poller VERIFIED still healthy after the archive (last tick at 19:06:59, still ticking every 60s, stderr empty)
  - Captured real Tailnet hostnames via `tailscale status` on MBP1: only 2 of 11 devices currently active (MBP1 + mini). MBP2 offline 18d. 3 stale MBP2 duplicates from OS upgrades. 3 Windows devices (`bg-ccw`/`desktop-vamr20a`/`homepcwet`) all offline; physical identity unknown.
- **2026-05-23 23:13 UTC** [SSH aliases] — Fired `fix-ssh-aliases-v2-tailnet-reality.command`. Result:
  - Backed up `~/.ssh/config` to `config.bak.20260523190957`
  - Revealed existing `Host mini` block: HostName `brandons-mac-mini.tail5646cc.ts.net`, User `brandonglomski`, IdentityFile `~/.ssh/id_ed25519_mini`
  - Removed 3 bogus blocks (mbp-2, hp, thinkpad) with wrong hostnames added earlier today
  - Added 1 correct `mbp-2` block with real Tailnet hostname (`brandons-macbook-pro-2.tail5646cc.ts.net`) + correct user (`brandonglomski`)
  - SSH probe: mini ✓, mbp-2 ✗ (expected — MBP2 offline 18d)
  - hp + thinkpad LEFT OUT of `~/.ssh/config` until Windows machine identity is clarified
- **2026-05-23 23:14 UTC** [Vault docs] — Authored:
  - `30-Decisions/2026-05-23-bolt-poll-retirement.md` — canonical decision record
  - `00-System/fleet-tailnet-reality-2026-05-23.md` — what's actually on the Tailnet, mapping issues, action items
  - `10-Projects/_decision-packets/2026-05-23-windows-machine-identification.md` — new packet asking Brandon to map the 3 Windows Tailnet names to physical devices
  - Updated `00-System/CLAUDE-BOOTSTRAP.md` Hardware + fleet section with current state
  - Marked the bolt-poll vs mc-poller packet RESOLVED with banner + front-matter status
  - Updated `_decision-packets/README.md` with Resolved section
- **2026-05-23 23:14 UTC** [Constraint adherence] — Zero hard-rule actions taken outside scope: no DNS, no Stripe, no Shopify, no email-sends, no PR merges, no production deploys, no live customer/sponsor contact. Email allowlist (§5b) unbroken. All work was internal fleet hygiene + documentation.

Session handoff (long-term hygiene): `handoffs/2026-05-23T23-30-00Z-claude-cowork-mbp-longterm.md`

- **2026-06-02 04:31 EDT** [FlashFlow] — Audited Claude's FlashFlow launch ship and deployed fixes for TypeScript, homepage nav, video-engine modes, and avatar TikTok posting
  - Files: web/components/TopNav.tsx, web/app/api/cron/avatar-content-tick/route.ts, web/lib/video-engine/*, web/app/create/page.tsx, web/app/admin/marketing/page.tsx, web/app/api/avatars/[id]/heygen/register-photo/route.ts
  - Commands: npm run type-check; changed-file eslint; npm run build; git push origin master; curl /api/health; browser/Chrome smoke
  - URL: https://flashflowai.com
  - SHA: 03ccc1b
  - Blockers: Supabase connector needs reauth to list migrations directly; production health DB check passes and Claude's schema-dependent routes are deployed
  - Next: Run wife QA checklist with a signed-in account and watch avatar registration / voice picker against real user data
