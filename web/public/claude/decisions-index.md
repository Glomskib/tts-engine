---
name: DECISIONS_INDEX
purpose: One-line rollup of every active decision. Scan this in 20 seconds before changing anything. Read the full decision file (linked) if any of these touches what you're about to modify.
last_updated: 2026-05-24
regenerate_via: scripts/memory/compile-decisions-index.sh (TBD — for now, append manually when adding a decision)
---

# Decisions Index

> **Every AI chat:** Read this file before changing anything in the Vault, scheduled tasks, deployed code, or fleet config. If any active decision touches what you're about to change, read the full decision file before proceeding. See `AI_WORKING_RULES.md` rule 18 for the revert protocol.

## How to read this

- One line per active decision, newest first
- Format: `[YYYY-MM-DD] [venture] decision title — status — file`
- Statuses: **active** (locked), **superseded** (link in file), **reverted** (explanation in file)

## Active decisions (newest first)

| Date | Venture | Decision | Status | File |
|------|---------|----------|--------|------|
| 2026-05-24 | brain/ops | Revert Protocol added as AI_WORKING_RULES #18 — chats must check prior context before undoing state | active | `DECISIONS/2026-05-24-revert-protocol.md` |
| 2026-05-24 | brain/ops | Canonical naming: FF-MC = `mc.flashflowai.com/admin`, MMM-MC = `makingmilesmatter.org/team` — never say just "MC" | active | `DECISIONS/2026-05-24-two-mcs-canonical-naming.md` |
| 2026-05-24 | brain/ops | Canonical brain = MacBook Pro VAULT (mini mirrors it, not vice versa) | active | `DECISIONS/2026-05-24-canonical-brain-is-macbook-pro-vault.md` |
| 2026-05-24 | brain/ops | OpenMemory MCP lives on mini, not MBP1 | active | `DECISIONS/2026-05-24-openmemory-mcp-on-mini-not-mb1.md` |
| 2026-05-24 | brain/ops | Auto-handoff trigger fires at ~30% remaining context | active | `DECISIONS/2026-05-24-auto-handoff-at-30pct-context.md` |
| 2026-05-23 | brain/ops | `com.openclaw.mc-poller` is sole canonical poller for `bolt-mini` agent identity (bolt-poll.sh retired) | active | `30-Decisions/2026-05-23-bolt-poll-retirement.md` |
| 2026-05-23 | brain/ops | Send-recipient allowlist: only `brandon@makingmilesmatter.com` + `spiderbuttons@gmail.com` without separate approval | active | `AI_WORKING_RULES.md` rule 5b |
| 2026-05-02 | FF/ops | AgentOS strategy (long-form rationale) | active | `30-Decisions/2026-05-02-agentos-strategy.md` |
| 2026-05-01 | MC | MC-as-SaaS decision | active | `30-Decisions/2026-05-01-mc-saas-decision.md` |
| 2026-04-30 | FF | FlashFlow pricing strategy ($29 Creator Pro = current target tier) | active | `30-Decisions/2026-04-30-flashflow-pricing-strategy.md` |
| 2026-04-30 | brain/ops | Render systems canonical | active | `30-Decisions/2026-04-30-render-systems-canonical.md` |
| 2026-04-30 | HHH | QR rider check-in approach | active | `30-Decisions/2026-04-30-qr-rider-checkin.md` |
| 2026-04-30 | HHH | Sponsor Scout bot design | active | `30-Decisions/2026-04-30-sponsor-scout-bot-design.md` |
| 2026-04-29 | brain/ops | Mac takeover master decisions (foundation set) | active | `30-Decisions/2026-04-29-mac-takeover-master-decisions.md` |

## Locked from CURRENT_CONTEXT_PACK.md (do not relitigate per AI_WORKING_RULES #15)

| Topic | Locked state |
|-------|--------------|
| HHH 2026 sponsor tiers | Headline $2,500 / Contributing $1,000 / Supporting $300 / In-kind. Free-rider perks on paid distances only. 15-mile is free + guided for everyone. |
| TCG Life pricing | $50/mo flat, no % spend |
| TCG Life suppliers | SalesFirst Dist for TCG, BCW for supplies. Bimonthly group orders |
| TCG Life refunds | No refunds. Cancel before supplier deadline |
| TCG Life branding | Pokemon supported, never named in branding |
| MMM tagline | "Chasing Adventure. Creating Impact." |
| Stripe account split | MMM on its own account; Zebby's World LLC account hosts FF + TCG Life |
| Per-product branding | via Stripe `statement_descriptor_suffix` |
| Speed rule | Parallelize by default. Minimum-sellable cut first. Brandon doesn't fire `.command` files |
| Device permissions | L1-L5 tiers. Mini L3→L4. ThinkPad stays L1 (security guard) |
| HHH/MMM email FROM | Always `miles@makingmilesmatter.com`. NEVER `spiderbuttons@gmail.com` |
| Send allowlist (TO) | Only `brandon@makingmilesmatter.com` + `spiderbuttons@gmail.com` without separate approval |

## How to add an entry

1. Make the decision (or detect that one happened by writing/reverting something).
2. Append a new row at the top of "Active decisions" with today's date, venture, title, status, and file link.
3. If non-trivial, also create the full decision file in `DECISIONS/` per `DECISIONS/TEMPLATE.md`.
4. If superseding an old decision, change the old row's status to **superseded** and add the supersession link to the old file.

## How to query

- Scan this file first (20 seconds).
- For full reasoning, open the linked decision file.
- Once OpenMemory MCP is live on mini, query: `mcp query: "decisions touching <topic>"`.

## Last updated

2026-05-24 — initial build during the operations-plugin customization session. Seeded with all currently-active decisions from `DECISIONS/`, `30-Decisions/`, and locked items from `CURRENT_CONTEXT_PACK.md`.
