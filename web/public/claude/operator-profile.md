---
name: BRANDON_OPERATOR_PROFILE
purpose: Who Brandon is, how he works, what he's building. The first thing any AI tool should read after CURRENT_CONTEXT_PACK.md.
source_of_truth: This file is canonical for "who Brandon is and how he wants to work." Update by direct edit, never by inference.
last_updated: 2026-05-10
---

# Brandon Glomski — Operator Profile

## Who he is

Brandon Glomski. Builder and operator running multiple ventures from a 5-device AI fleet in Findlay, Ohio. Brain-surgery survivor — talk to him like a friend, not an executive. Husband to Katlyn (chronic illness driver behind Zebby's World). Lifelong cyclist + outdoorsman. Honest about his depression history, found peace in miles before the business.

**Email:** miles@makingmilesmatter.com (HHH/MMM-related) · brandon@makingmilesmatter.com · spiderbuttons@gmail.com
**Phone (Telegram + Bolt):** 4198893116
**Tailnet:** tail5646cc.ts.net
**GitHub org:** Glomskib

## Working style — read this every session

- **Hours, not weeks.** If something looks multi-day, decompose it and parallelize.
- **Act first, not ask first.** Confirm only on irreversible actions (sending mail, posting social, money movement, DNS, deletes). Everything else: execute, then report.
- **Plain language.** No corporate jargon, no academic explanations, no buzzword stacking. Friend-tone.
- **Decisive.** Brandon makes calls fast. AI agents should propose-first, loop later.
- **Hates fake progress.** No placeholder dashboards, no audits-that-go-nowhere, no "I'll plan this." Either ship working work or state a precise blocker.
- **Wraps dev tasks in scripts.** AI agents fire .command files via computer-use, not Brandon. He should never have to double-click anything unless the system is broken.
- **Read 1-2 existing examples before writing new code.** 30 seconds of pattern-matching beats follow-up commit cycles.
- **After every push, verify deploy.** /api/health SHA must match git HEAD. If stuck, STOP and diagnose pipe.

## Anti-patterns (things he hates)

- Repeated questions when the answer exists in the vault, memory, or recent chat
- Audits with no execution attached
- Asking for permission when execution would be fine
- Bullet-point pyramids and walls of text
- "I'll get back to you" — either do it or say what's blocking
- Estimates without breakdown
- Polish-before-ship — minimum-sellable first, polish second
- Confusing old plans with current decisions
- Sequential agent spawning when parallel works

## Technical skill level

- **Strategic** at the venture / product / pricing level — knows what to build and why
- **Functional** at the code level — can read, can ship via scripts, doesn't write much himself anymore
- **Confident** at deploy ops once instructions are clear — fires .command files, reads logs
- **Comfortable** with Telegram + Bolt + Claude Desktop + Claude Code workflows
- Has used: Vercel, Supabase, Stripe, Shopify, Resend, GoDaddy, Tailscale, Cloudflare tunnels, GitHub, Late.dev, ElevenLabs
- Does NOT want to: write code by hand, debug TypeScript types, reformat partition tables, manage launchd by hand
- Real revenue target: **$100k take-home, not $25M unicorn**. Small operator AI infrastructure is his frame.

## Active ventures (revenue-first priority order)

1. **Making Miles Matter** (nonprofit) + **HHH 2026** (Sept 12 in Findlay) — top priority week-of, sponsor revenue this quarter
2. **FlashFlow AI** (flashflowai.com) — TikTok Shop + creator content engine, SaaS revenue
3. **Mission Control** (mc.flashflowai.com) — agent ops layer for the fleet, internal tool
4. **TCG Life** (CCW TCG buying group) — $50/mo membership, near-term launch
5. **Zebby's World** (zebbysworld.com) — chronic-illness app for Katlyn + EDS community, long-term
6. **BuyBackOS** — B2B SaaS for resale/buyback compliance, multi-tenant home (TCG Life lives inside)
7. **PorchLight AI** — trades CRM/lead-gen, deferred
8. **TCG Scan Pro** — Flutter card scanner, CCW TCG inventory backbone
9. **False Chord Passport** — minor
10. **Dog Breeder Website Template** — minor side product
11. **Liquidation Decision Engine** — research stage

## Fleet (5 devices, all online)

| Device | Role | Tier |
|---|---|---|
| **MBP1** (13" 2020) | Command center, daily console, fires ship scripts | Operator desk |
| **Mac mini** | Primary always-on worker, OpenClaw/Bolt host, renders, queue processing. 2TB SSD active + 5TB HDD cold. | L3→L4 (earns L5 after 30 clean days) |
| **MBP2** (15") | Secondary worker, backup render, staging | L1→L3 (post-verification) |
| **HP i7** (Windows) | Browser automation, Playwright, TikTok workflows | L1 until OpenSSH enabled |
| **ThinkPad i5** | Fleet health monitor, logs, alerts, low-power utility | L1 (security guard, stays here) |

Plus: 2TB external APFS encrypted SSD on MBP1 with 4 volumes (Working / Backups / Renders / Archive).

## Shipping philosophy

- **Revenue-first.** Every feature, every push, every script: does this help generate or protect revenue?
- **Minimum-sellable.** Ship the core path first, defer polish. White-label and Stripe Connect can wait.
- **Speed = compound.** Faster shipping → more learning → faster better decisions → more revenue.
- **Survive reboots.** Anything I install must come back after a restart.
- **Reduce cognitive overload.** Brandon's one operator. The system must be understandable by one person.

## Family / personal context

- Wife Katlyn (chronic illness — EDS) is the driver behind Zebby's World
- Tim and Josh are MMM cofounders (interviews pending for the hub copy)
- Brandon had brain surgery — plain language is non-negotiable
- Lives in Findlay, OH. HHH route is North + South of Findlay.

## Last updated: 2026-05-10 by Claude during the Memory OS build
