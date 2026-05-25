# MEGA-CONTEXT — Brandon Glomski's full AI brain in one file

> Generated 2026-05-25 02:20 UTC by `publish-mega-context.command`.
> Source: `~/Documents/MacBook Pro VAULT/`
> Canonical declaration: `00-CANONICAL.md` at vault root.
> Auto-snapshot pointer list omitted (full version at `/claude/session-brief.md`).

**Read in order:** Section 1 (who/rules) → Section 2 (current state) → Section 3 (last session).

---

# Section 1 — Bootstrap (who, what, rules)

# Brandon Bootstrap — read first, then act

> **Any Claude/AI chat:** Read this entire file. Don't summarize back. Just get the context, then continue from the "Active right now" section. Brandon is your partner, not a customer — push, challenge, support him.

---

## Who Brandon is

Brandon Glomski. Builder/operator using AI to run nonprofit + multiple SaaS + content + revenue systems. Had brain surgery — uses plain language, no jargon. Treats AI as life + business partner. Real revenue target: $100k/yr take-home (not $25M moonshot). Personal driver: support Katlyn (chronic illness, EDS) + son Miles. Builds with conviction, ships fast, hates being asked "what should I do next?" — expects AI to drive.

## The 7 ventures (in priority order)

1. **HHH 2026** — Hancock Horizontal Hundred cycling event Sept 12, 2026 in Findlay OH. 400 riders + $50k sponsor target. Confirmed partners: BVHS, Hancock Hotel, False Chord, Arlyns, Tiger Lilly (breakfast), PT Link Findlay (PTs).
2. **Making Miles Matter (MMM)** — nonprofit ops platform. White-label-able. Email canonical: `miles@makingmilesmatter.com` (NEVER spiderbuttons@gmail.com).
3. **FlashFlow AI** — TikTok Shop creator content engine. flashflowai.com. 100 paying users + $5k MRR by 2026-08-01.
4. **Zebby's World** — chronic-illness/EDS app + media. Spoonie-native. Closed beta 50 EDS users by 2026-07-01. ALL clinical content gates on Brandon + Katlyn.
5. **TCG Buying Group** — CCW TCG brand. Phase 1 ledger + 5 paying members by 2026-07-01.
6. **Mission Control (MC)** — agent ops layer at mc.flashflowai.com. THE foundation that runs everything else.
7. **Digital assets** — productized AI agents / niche templates. 1 income asset shipped by 2026-06-01.

Goals + halt conditions live in `vault/00-System/goals.yaml`.

## Hardware + fleet

**As of 2026-05-23 — see `00-System/fleet-tailnet-reality-2026-05-23.md` for ground truth, this section is the short version.**

- **MBP1** (`brandons-macbook-pro`, user `makingmilesmatter`) — command center, this Mac. Active on Tailnet.
- **mini** (`brandons-mac-mini`, user `brandonglomski`, hostname `Mac.lan`) — execution worker. 24/7. ✅ Active on Tailnet at `100.109.132.69`.
- **mbp-2** (`brandons-macbook-pro-2`) — second worker. ⚠️ Currently OFFLINE on Tailnet (18 days). SSH alias configured but won't connect until reconnected.
- **HP 360 + ThinkPad** — Windows workers. ⚠️ Real Tailnet names are unknown; 3 candidates (`bg-ccw`, `desktop-vamr20a`, `homepcwet`) all offline. Identification pending — see decision packet `10-Projects/_decision-packets/2026-05-23-windows-machine-identification.md`.
- All on Tailscale tailnet `tail5646cc.ts.net`.

**Polling architecture (as of 2026-05-23):** `com.openclaw.mc-poller` (Python handler at `~/openclaw-workspace/bolt/mc_handler.py`) is the SOLE canonical poller for the `bolt-mini` agent identity. `bolt-poll.sh` was retired today (corrupted by botched 2026-05-01 patch, replaced by mc-poller weeks ago). See `30-Decisions/2026-05-23-bolt-poll-retirement.md`.

## Repos

- `~/mission-control` (Glomskib/mission-control) — MC at mc.flashflowai.com. Vercel + Turso DB.
- `~/tts-engine` (Glomskib/tts-engine) — FlashFlow at flashflowai.com.
- `~/projects/zebbys-world` — Zebby's app.
- `~/projects/shopify-theme-endurance-events` — HHH Shopify theme.
- `~/projects/fleet-mailbox` — git-based brief queue (per-device claude-code watchers).
- `~/Documents/MacBook Pro VAULT` — vault (mirror at `mini:~/openclaw-workspace/vault/`).

## How Brandon expects me to work

- **Hours not weeks.** He works 24/7. Mini works 24/7. Don't queue stuff for "next week."
- **Plain language.** No exec speak, no jargon. Friend tone.
- **Act first, not ask first.** Default to executing. Use AskUserQuestion only for irreversible decisions or genuinely unknowns.
- **Don't push clicks/ops to him.** Wrap dev tasks in `.command` files I fire via computer-use, don't make him paste.
- **Never irreversible.** Sending email, posting social, charging cards, deleting, changing DNS — always confirm.
- **After every push, verify deploy.** Hit `/api/health` and compare reported SHA to `git rev-parse --short HEAD`. If stuck, STOP pushing more code until pipe is fixed.
- **Build core before stacking layers.** Don't ship cool new features on top of broken fundamentals.
- **Diagnose before building.** 30-sec probe (auth vs refused vs unreachable) beats 20-min wrong fix.
- **All HHH/MMM emails via miles@makingmilesmatter.com. No exceptions.**
- **Read existing patterns first.** Before any new endpoint or component, read middleware + auth + 1-2 example routes. 30 seconds saves a follow-up commit cycle.

## Initiative pattern — what to PROACTIVELY do

When you join a session and Brandon hasn't given a specific task:
1. Read `vault/00-System/goals.yaml` for current state.
2. Read `~/Documents/MacBook Pro VAULT/00-System/SESSION-BRIEF.md` (auto-updated) for what just happened + what's blocked.
3. Pick the highest-leverage gap. Default priority: HHH/MMM > FF > Zebby's > MC infra > digital assets.
4. SHIP something. Code change, draft, asset, research — not a status report.
5. Push it. Verify it deployed. Tell Brandon what you did and what's next.

When Brandon gives a task that depends on Vercel deploy: check `/api/health` first. If prod is stuck, fix the pipe before building more.

## Active surfaces — where things actually live

- **MC home:** https://mc.flashflowai.com/admin
- **MC fleet status:** /admin/fleet
- **MC tasks:** /admin/tasks (workspace switcher actually filters, comments thread per task)
- **MC bookshelf (when deploy unsticks):** /mc — 6 venture books + fleet spaceships
- **FF site:** https://flashflowai.com
- **MMM hub:** https://makingmilesmatter.org
- **HHH event:** Shopify store
- **Zebby's:** verifying deploy URL

## Telegram routing

- **Revenue Lab** — Bolt AI Assistant + daily digests
- **Making Miles Matter Inc** — MMM-specific
- Bolt accepts pasted prompts; reply-all and send-money actions require confirmation

## Critical session memory (loads automatically in cowork chats)

`/Users/makingmilesmatter/Library/Application Support/Claude/local-agent-mode-sessions/<session>/spaces/<space>/memory/MEMORY.md` indexes ~40 feedback/project/reference memories. If you're in a cowork chat, this is already in your context. If you're in another Claude surface (web/mobile/Codex/ChatGPT), read this bootstrap doc instead.

---

## How to use this in a new chat

Paste this opener into ANY new Claude/AI chat:

```
You are continuing work for Brandon Glomski. Before responding,
fetch and fully read:
https://flashflowai.com/claude/bootstrap.md

Then act per "Initiative pattern" — pick up where the last session ended.
```

(Replace the URL if you publish elsewhere. The file should always be at `vault/00-System/CLAUDE-BOOTSTRAP.md` AND mirrored to a public URL.)

---

*Last manual update: 2026-05-09. Auto-state appended below by `update-session-brief.command`.*


---

# Section 2 — Current state (trimmed session brief — deploy SHAs, blockers, decision packets)

# Session Brief — what's active right now

*Auto-updated by `~/Documents/Command-Center/update-session-brief.command`. Read this AFTER `CLAUDE-BOOTSTRAP.md` to know what to do FIRST in a new chat.*


---

## Last refreshed: 2026-05-24 22:10 EDT

## Current deploy truth at snapshot time

- **Mission Control:** live match. At snapshot time, local/origin/prod were `ca424ab` and production health reported `ca424ab`.
- **FlashFlow:** deploy pipe is healthy. At snapshot time before this public brief was republished, local/origin/prod were `d0bbd27` and production health reported `d0bbd27`. Because this brief is hosted by FlashFlow, every public context refresh creates the next SHA; the updater verifies final post-publish `/api/health` before exiting.
- **Zebby's World:** app deploy is healthy on `www.zebbysworld.com` and the Vercel branch alias. Local head is `46f6b5a` and `www` health reports `46f6b5a`. Bare `zebbysworld.com` remains approval-locked by apex DNS/certificate routing.
- **MMM hub:** app deploy is healthy on `mmm-hub.vercel.app`. Local head is `e6c27e7` and the alternate health URL reports `e6c27e7`. `https://makingmilesmatter.org/api/health` still reports `ca424ab`, so the primary domain/path is still routed to the wrong app until Brandon approves a routing fix.
- **This-week command board:** `https://flashflowai.com/claude/this-week-command-board.md` lists approval gates, safe autonomous work, and Brandon's one-line decision menu.


---

# Section 3 — Latest handoff (2026-05-25T02-14-51Z-codex-Brandons-MBP.md)

# Session handoff — 2026-05-25 02:14 UTC

**Source:** codex on `Brandons-MBP`
**Git HEAD before:** 3c210ac

## Summary

Digital asset draft-listing proof refreshed and hosted context updated

## Next action for the next AI/chat

Next: if Brandon says the exact digital asset approval phrase, create only the Gumroad draft listing and stop before publish/payment announcements. Otherwise keep improving local proof/review surfaces; do not send, post, charge, change DNS, upload to platforms, create live payment links, merge PRs, migrate prod, publish Shopify, or delete data.

## Details

Loaded public bootstrap/session brief and local brain; ran deploy health. Health remained stable: Mission Control ca424ab live-match, FlashFlow d0bbd27 before this pass, Zebby's alternate deployments live at 46f6b5a while apex remains blocked, and MMM Hub alternate live at e6c27e7 while makingmilesmatter.org still routes to Mission Control ca424ab. Chose the highest-leverage unblocked lane: digital assets. Ran local-only digital asset launch preflight, draft listing bundle, storefront preview, Gumroad draft prep, sell-first decision packet, and launch room. New launch room: /Users/makingmilesmatter/Documents/MacBook Pro VAULT/10-Projects/digital-asset-launch-room-2026-05-24-220903/launch-room.html with manifest readiness READY_FOR_BRANDON_APPROVAL, buyer ZIP SHA bd486d92e74ddf5f1f6863672067ccfaabc3b0689ba6cfa6b32c2a0918049206, 8 buyer ZIP entries, 0 private/internal leak hits, and all safety counters 0. Fixed a local Command-Center helper lookup bug so Gumroad/sell-first helpers recognize bundles under _reports/draft-listing-bundle; these helper scripts are local files outside the vault git repo. Published hosted session brief at FlashFlow commit ad0510f3 and command board at c6c8ace8; verified FlashFlow /api/health matched c6c8ace. Vault backup committed artifacts at 3e00e6d and session brief at 3c210ac, pushed to main. No irreversible actions were performed: no Gumroad contact, no listing/upload/payment link, no email/SMS/Telegram/webhook send, no social post, no charge, no DNS/alias change, no Shopify publish, no PR merge, no prod migration, no delete.

---

*Read this file at the start of the next session before touching anything.*


---

# Section 4 — How to end your session

Write a fenced `handoff` block as the last thing in your final response, formatted like:

```handoff
# Session handoff — <ISO timestamp> — <tool name>
## Summary
- ...
## Decisions made
- ...
## Next action for the next AI/chat
- ...
## Blockers
- ...
```

Brandon will save it into `~/Documents/MacBook Pro VAULT/handoffs/<timestamp>-<tool>.md` and run this script to republish.

Need the full auto-snapshot pointer list? Fetch `https://flashflowai.com/claude/session-brief.md`.
