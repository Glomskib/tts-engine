---
name: MEMORY_CONFLICT_RULES
purpose: When sources disagree about Brandon's reality, which one wins. Read by every AI tool before acting on remembered facts.
last_updated: 2026-05-10
---

# Memory Conflict Rules

When you have two facts that disagree, use this order. Higher = wins.

## Source-of-truth hierarchy

1. **Latest direct Brandon instruction** — in chat, in Telegram, in voice memo
2. **CURRENT_CONTEXT_PACK.md** — `00-System/CURRENT_CONTEXT_PACK.md`
3. **Project CURRENT_STATUS.md** — `10-Projects/[name]/CURRENT_STATUS.md`
4. **Project DECISIONS.md** — `10-Projects/[name]/DECISIONS.md`
5. **Project SHIPPED_LOG.md** — `10-Projects/[name]/SHIPPED_LOG.md`
6. **Older vault notes** — `30-Decisions/`, `90-Logbook/`, `00-System/SESSION-BRIEF.md` (yesterday's version), etc.
7. **LLM trained knowledge** — what the model "knows" from training data

## The rules

### Newer beats older

If two facts disagree and one is from a more recent source, the recent one wins. "Recent" means most recently written/edited file, not most recently read by you.

Example: `30-Decisions/2026-04-30-flashflow-pricing-strategy.md` says FlashFlow costs $29/mo. `10-Projects/FlashFlow/DECISIONS.md` was updated 2026-05-10 and says $39/mo. → **$39/mo wins.**

### Shipped proof beats plans

If a plan said "we'll build X" but the actual deployed code does Y, **Y wins**. Plans are intent, code is reality.

Example: A vault note from a week ago says "registration page will use Stripe Subscriptions." The actual Shopify product is a one-time purchase. → **One-time purchase wins.** Update the vault note.

### Verify before acting on memory of a specific identifier

If you're about to act on something like "edit file X" or "use env var Y" or "click button Z" — and you "remember" that thing exists — **verify first**:
- For files: check the file exists
- For env vars: grep the codebase
- For UI elements: take a screenshot

Memory is a claim that something existed when the memory was written. It may have been renamed, removed, or never merged.

### Mark uncertainty over guess

If two sources disagree and you can't tell which is current:
- **Don't pick one and act**
- Write `UNCLEAR — [source A] says X, [source B] says Y, defaulting to higher-priority source per MEMORY_CONFLICT_RULES`
- Move on with the higher-priority source's version
- Flag for Brandon to confirm at the bottom of your response

### Confirm with Brandon when stakes are high

For decisions that:
- Move money
- Send communications to real people
- Change pricing
- Modify production systems
- Set DNS / change domain behavior

…and where memory is contradictory or stale, **ask Brandon** rather than guess. One ask now beats one rollback later.

## What counts as "Brandon instruction"

In priority order:
1. The current chat session (highest signal)
2. Today's voice memo / Telegram message
3. Yesterday's chat (medium signal — check if anything's since been overridden)
4. Older chat history (lower signal — only use if no newer source contradicts)

If Brandon hasn't said anything about a specific thing, fall to source #2 in the hierarchy.

## Stale source detection

A source is "stale" if any of these apply:
- The file's `last_updated` (or git mtime) is > 30 days old AND the topic is fast-moving (pricing, scope, partners)
- The file's claims contradict a deploy SHA or git log entry from the last 7 days
- The file describes a "planned" state that was either shipped or abandoned
- The file mentions specific people, tiers, or numbers that have since been revised

When you find a stale source, append a note at the top:
```
STALE — superseded by [newer source]. Last verified [date].
```

Don't delete stale sources. Brandon may need the history for context.

## The "trust but verify" rule

For high-stakes claims from memory (revenue numbers, partner commitments, technical configs):
- **Trust:** use the remembered fact as your working hypothesis
- **Verify:** confirm it against the source-of-truth hierarchy before acting on it

For low-stakes claims (Brandon's preference for plain language, his hatred of polish-before-ship): trust without verifying. These are stable facts that don't change weekly.

## Examples of common conflicts

### Conflict: Tier pricing

- Old `30-Decisions/2026-04-15-hhh-sponsor-tiers.md`: "Gold $1,500, Silver $750, Bronze $250"
- `CURRENT_CONTEXT_PACK.md` (2026-05-10): "Headline $2,500, Contributing $1,000, Supporting $300"
- **Winner:** CURRENT_CONTEXT_PACK.md. Old file is stale.

### Conflict: Stripe account

- Older note: "MMM membership lives on Zebby's World Stripe."
- Brandon today: "MMM is on its own account; only Zebby's-LLC products on Zebby's account."
- Stripe API: shows MMM products on Zebby's account.
- **Winner:** Brandon's today instruction. The Stripe state is a mistake to fix (= task #145). Move MMM products to MMM account.

### Conflict: Watcher running

- Memory file: "MBP watcher posts heartbeats every 60s."
- /api/health: `agents.stale_4h: 8` (none alive).
- **Winner:** /api/health. Memory was true when written; reality is the watcher's been broken for days.

## Last updated

2026-05-10
