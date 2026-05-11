---
name: TOOL_HANDOFF_PROTOCOL
purpose: How AI tools hand work to each other so nothing is dropped, rediscovered, or repeated. Used by ChatGPT, Claude Desktop, Claude Code, Bolt, OpenClaw, Mission Control, mini's Claude Code watcher, and any future agent.
last_updated: 2026-05-10
---

# Tool Handoff Protocol

When one AI tool finishes a piece of work and another AI tool will pick it up, the handing-off tool MUST produce a handoff block that contains every field below. The receiving tool MUST read that block before starting.

## The required handoff block

```
─── HANDOFF ──────────────────────────────────────────────
Project:           [project name from 10-Projects/]
Current state:     [1-3 sentences: where this work is right now]
Last shipped:      [SHA, URL, file path, or other proof]
Files touched:     [list of paths — be exhaustive]
Env vars needed:   [name only, not value — list any env vars the next tool needs]
Migrations needed: [DB migration names, schema versions, ordering]
What's next:       [the next concrete action — must be doable in 1-3 hours]
What NOT to redo:  [things already tried/decided, link to DECISIONS.md if applicable]
Blockers:          [precise blockers OR "none"]
Acceptance criteria:[how the next tool knows it's done]
Handoff from:      [tool name + timestamp]
Handoff to:        [tool name OR "any agent / queue"]
─────────────────────────────────────────────────────────
```

## Where handoff blocks live

- **Fleet briefs** (in `~/fleet-mailbox/queued/<brief_id>.md`): handoff block goes in the body
- **MC tasks** (in Mission Control): handoff block goes in the task description
- **Per-project status** (in `10-Projects/[name]/CURRENT_STATUS.md`): the bottom of the file is always the latest handoff
- **Chat-to-chat handoffs** (Brandon switching between Claude Desktop and ChatGPT, etc.): paste the block into the new chat

## Examples

### Example 1 — Claude Desktop hands FF fix to mini's Claude Code

```
─── HANDOFF ──────────────────────────────────────────────
Project:           FlashFlow AI
Current state:     TUS resumable upload code on disk in /Users/makingmilesmatter/tts-engine/web/, build clean, ship script ship-ff-tus-and-nav.command firing
Last shipped:      mc.flashflowai.com b1ad9da (Phase 1)
Files touched:     web/lib/editor/resumable-upload.ts (new), web/app/admin/editor/new/page.tsx (modified), web/app/page.tsx (modified), web/components/PublicLayout.tsx (modified), web/package.json (+ tus-js-client@4.3.1)
Env vars needed:   none new (NEXT_PUBLIC_SUPABASE_URL already set)
Migrations needed: none
What's next:       After deploy verifies on flashflowai.com SHA, manually test a 100MB+ video upload at /admin/editor/new and confirm it completes
What NOT to redo:  Don't switch back to direct-PUT — Supabase has a hard 50MB POST cap. TUS is the only path.
Blockers:          none
Acceptance criteria: 124MB MP4 uploads succeed, progress bar updates in real time, file lands in mc-proofs bucket
Handoff from:      Claude Desktop, 2026-05-10 23:25 EDT
Handoff to:        mini's Claude Code watcher (or anyone running E2E)
─────────────────────────────────────────────────────────
```

### Example 2 — Brandon switches chats (ChatGPT → Claude)

Brandon pastes this block at the top of the new chat:

```
─── HANDOFF ──────────────────────────────────────────────
Project:           HHH 2026 sponsor outreach
Current state:     Pitch deck drafted (vault/10-Projects/HHH-2026/HHH-2026-Sponsor-Pitch-Deck.md, 248 lines). 6 confirmed partners. Need 25 cold first-touch emails.
Last shipped:      Tier table locked, mission tagline locked
Files touched:     vault/10-Projects/HHH-2026/* (4 files)
Env vars needed:   miles@makingmilesmatter.com mailbox
Migrations needed: none
What's next:       Generate 25 personalized first-touch emails to cold prospects across 10 categories (bike shops, healthcare, restaurants, banks, insurance, realtors, manufacturers, law firms, regional cycling, corridor businesses Bowling Green/Ottawa)
What NOT to redo:  Don't re-pitch the 6 confirmed partners (BVHS, Hancock Hotel, False Chord, Arlyns, Tiger Lilly, PT Link). Tier prices are locked.
Blockers:          Brandon to forward Tim/Josh founder interview text. F1-F5 stats pending — sponsor deck has placeholders.
Acceptance criteria: 25 emails drafted in vault/10-Projects/HHH-2026/sponsor-outreach/, named by recipient, ready for Brandon to read + I send the test batch first to brandon@ + spiderbuttons@
Handoff from:      Claude Desktop (Mac Takeover session), 2026-05-10
Handoff to:        Whichever AI Brandon's chatting with next
─────────────────────────────────────────────────────────
```

## Rules for the handoff itself

1. **Every field filled.** If a field is "none," write "none." Empty fields = the handoff is incomplete.
2. **Concrete proof, not promises.** "Last shipped" must be a SHA, URL, or file path that someone can verify. Don't write "shipped successfully."
3. **No relitigation.** "What NOT to redo" is the firewall against the next tool wasting cycles on settled questions.
4. **Acceptance criteria is binary.** Either the next tool can answer "did I hit the criteria, yes/no?" or the criteria is too fuzzy.
5. **Update the project files.** The handoff block in `CURRENT_STATUS.md` at the project level should always match the latest handoff. If they disagree, the project file is stale — fix it.

## What kills a handoff

- "I think it's mostly working" — not concrete
- "Let me know if you need anything" — not actionable
- "Pick up wherever" — not a handoff
- "Continue the conversation" — not a handoff
- "Status: in progress" — meaningless

## Fast handoffs (chat → chat, no project file update)

Sometimes you need a quick handoff between chat sessions without writing to vault. Use this minified version:

```
HANDOFF: [project] — [current state in 1 line] — last [proof] — next [action] — blocked by [thing or "none"]
```

Example: `HANDOFF: HHH sponsor outreach — pitch deck drafted, need 25 cold emails — last vault/HHH-2026/Sponsor-Pitch-Deck.md — next generate emails by category — blocked by none`

## Last updated

2026-05-10
