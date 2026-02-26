# Brain Feed — GitHub Integration

The brain dispatcher reads approved decision files and creates Mission Control tasks.
It supports two sources: **local Obsidian vault** (dev) and **GitHub repo** (Vercel production).

## Source Priority

1. **Local vault** — if `OBSIDIAN_VAULT_PATH` is accessible on the filesystem
2. **GitHub** — if `GITHUB_TOKEN` is set
3. **Skip** — neither available (no-op, no error)

## Required Environment Variables

### Vercel (Production + Preview)

| Variable | Value | Required |
|----------|-------|----------|
| `GITHUB_TOKEN` | Fine-grained PAT (see scopes below) | Yes |
| `BRAIN_FEED_GITHUB_OWNER` | `brandonglomski` | Optional (default) |
| `BRAIN_FEED_GITHUB_REPO` | `brandons-second-brain-feed` | Optional (default) |
| `BRAIN_FEED_GITHUB_BRANCH` | `main` | Optional (default) |
| `BRAIN_FEED_GITHUB_PATH` | `Vault/Decisions` | Optional (default) |
| `BRAIN_FEED_WRITEBACK` | `true` | Optional (default: true) |

### Local (.env.local)

Same as above. If the Obsidian vault is mounted, local will be used instead of GitHub.

## GitHub Token Scopes

Create a **fine-grained personal access token** at https://github.com/settings/personal-access-tokens/new

- **Repository access**: Only select `brandons-second-brain-feed`
- **Permissions**:
  - **Contents**: Read and write (for listing, reading, and writing back to decision files)

That's it — no other permissions needed.

## How to Set in Vercel

```
cd ~/tts-engine/web

# Add each env var (Production + Preview)
echo "ghp_YOUR_TOKEN" | npx vercel env add GITHUB_TOKEN production
echo "ghp_YOUR_TOKEN" | npx vercel env add GITHUB_TOKEN preview

# Optional overrides (only if defaults don't work)
echo "brandonglomski" | npx vercel env add BRAIN_FEED_GITHUB_OWNER production
echo "brandonglomski" | npx vercel env add BRAIN_FEED_GITHUB_OWNER preview
```

## Decision File Format

Files in `Vault/Decisions/*.md` with this frontmatter get dispatched:

```yaml
---
status: approved
type: decision
project: FlashFlow
summary: Implement feature X
owner: bolt
priority: 2
---
```

**Required fields for dispatch:**
- `status: approved` — only approved decisions get dispatched
- `project` — must map to an active `cc_projects` entry

**Written back after dispatch:**
- `mc_task_id` — UUID of the created project_task
- `mc_status: created`
- `updated` — date of dispatch

## Endpoints

- **Cron**: `GET /api/cron/orchestrator` — runs brain dispatch as pass 1
- **Cron**: `GET /api/cron/brain-dispatch` — standalone brain dispatch
- **Admin**: `GET /api/admin/brain-feed/status` — health check (last runs, source, errors)

## Smoke Test

```bash
npx tsx scripts/brain-feed/smoke-dispatch.ts
```

Lists GitHub decisions, picks one, parses frontmatter, simulates dispatch (DRY_RUN=true by default).
Set `DRY_RUN=false` to actually create tasks and write back.
