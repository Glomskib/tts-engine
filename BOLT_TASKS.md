# BOLT TASKS — FlashFlow AI

> Persistent task tracker for Bolt sessions. Bolt MUST read this file at the start of every session and update it before ending.

## Active Tasks

_None currently assigned._

## Completed Tasks

| # | Task | Date | Notes |
|---|------|------|-------|
| — | — | — | — |

## Task Format

When adding tasks, use this format:

```
### Task [N]: [Short Title]
- **Status**: pending | in_progress | done | blocked
- **Priority**: P0 (critical) | P1 (high) | P2 (medium) | P3 (low)
- **Assigned**: [date]
- **Description**: What needs to be done
- **Acceptance Criteria**:
  - [ ] Criterion 1
  - [ ] Criterion 2
- **Files Changed**: list of files modified
- **Notes**: any context or blockers
```

## Rules for Bolt

1. **Read this file first** at the start of every session
2. **One task at a time** — finish or explicitly pause before starting another
3. **Update status** as you work (pending → in_progress → done)
4. **Log files changed** for every task
5. **Never delete tasks** — move completed ones to the table above
6. **Ask before starting** if a task seems unclear or risky
7. **Build before done** — run `pnpm build` and fix errors before marking done

## Project Quick Reference

- **Repo**: `/Volumes/WorkSSD/01_ACTIVE/FlashFlow`
- **Web app**: `/Volumes/WorkSSD/01_ACTIVE/FlashFlow/web`
- **Build**: `cd web && pnpm build`
- **Dev**: `cd web && pnpm dev --turbopack`
- **Stack**: Next.js 15 (App Router), Supabase, Stripe, Tailwind CSS
- **AI**: Anthropic Claude (primary), Ollama llama3.1 (local fallback)
- **Key files**:
  - `FLASHFLOW_RULES.md` — coding standards
  - `CLAUDE_INSTRUCTIONS.md` — task relay from Brandon
  - `web/lib/navigation.ts` — sidebar nav config
  - `web/lib/subscriptions.ts` — plan definitions
  - `web/lib/ai/router.ts` — AI model routing
