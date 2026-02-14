# Claude Code Task Queue Worker Setup

## Overview

8 Claude Code terminals poll a Supabase `task_queue` table and dispatch work to `claude --print` (headless Claude Code). Each task is a markdown prompt that Claude Code executes autonomously.

---

## Prerequisites

1. **Node.js 18+** installed
2. **Supabase access** (service role key set via env)
3. **Claude Code CLI** installed globally (`npm install -g claude-code`)
4. **Git** available in PATH

---

## Database Migration

Run the migration to create the `task_queue` table:

```bash
cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow/web

# Option 1: Manual execution in Supabase Dashboard
# Navigate to SQL Editor → paste contents of migrations/add_task_queue.sql → Run

# Option 2: Via CLI tool (if you have one)
psql -h db.qqyrwwvtxzrwbyqegpme.supabase.co \
     -U postgres \
     -d postgres \
     -f migrations/add_task_queue.sql
```

---

## Start 8 Worker Terminals

Each terminal runs the worker with a unique `TERMINAL_ID`:

### Terminal 1
```bash
export TERMINAL_ID=T1
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow/web
node worker.ts
```

### Terminal 2
```bash
export TERMINAL_ID=T2
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow/web
node worker.ts
```

**Repeat for T3–T8** (just change `TERMINAL_ID`)

---

## Dispatch a Task

### Via API (POST)

```bash
curl -X POST https://flashflowai.com/api/task-queue/dispatch \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "task_name": "T1 - Fix Theme Colors",
    "prompt_text": "You are working on FlashFlow...\n\n**Task:**\nFix theme color variables...",
    "priority": 10,
    "depends_on": null
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_name": "T1 - Fix Theme Colors",
    "status": "pending",
    "priority": 10,
    "created_at": "2026-02-14T18:30:00Z"
  }
}
```

### Via Direct Database Insert (Telegram → Supabase)

JARVIS or another agent can insert directly into `task_queue`:

```sql
INSERT INTO public.task_queue (task_name, prompt_text, priority, depends_on, created_by, status)
VALUES (
  'T1 - Theme Colors',
  'You are working on FlashFlow AI...',
  10,
  NULL,
  (SELECT id FROM auth.users LIMIT 1),
  'pending'
)
RETURNING id, task_name, status, created_at;
```

---

## Check Task Status

### Via API (GET)

```bash
curl https://flashflowai.com/api/task-queue/dispatch?id=550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_name": "T1 - Fix Theme Colors",
    "status": "completed",
    "priority": 10,
    "assigned_terminal": "T1",
    "claimed_at": "2026-02-14T18:30:05Z",
    "started_at": "2026-02-14T18:30:10Z",
    "completed_at": "2026-02-14T18:35:00Z",
    "result": {
      "commit": "abc1234",
      "output": "✅ All theme colors updated...",
      "success": true
    }
  }
}
```

### Via Database

```sql
SELECT task_name, status, assigned_terminal, result, completed_at
FROM public.task_queue
WHERE task_name = 'T1 - Theme Colors'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Task Payload Format

The `prompt_text` field is a full markdown prompt sent to Claude Code:

```markdown
# FlashFlow AI Development Task

**Repository:** /Volumes/WorkSSD/01_ACTIVE/FlashFlow

## Context
You are working on the FlashFlow AI Next.js 14 application.
Current branch: master
Latest commit: abc1234 (last feature work)

## Task: Fix Theme Color Variables

### Steps
1. Locate all tailwind color definitions in `/app/globals.css`
2. Replace deprecated color names with new naming scheme
   - Old: `bg-brand-primary` → New: `bg-flashflow-primary`
   - Old: `text-accent-blue` → New: `text-accent-ocean`
3. Run: `npm run build`
4. Verify no build errors
5. Commit with message: "fix: update tailwind color scheme"
6. Push to master

### Testing
- Build should complete with 0 errors
- All imports should resolve

### Important
- Do not modify `/api` routes
- Do not change database schema
- Only edit CSS and component files

---

## Terminal Output Expectations

When a worker claims and executes a task:

```
⏱️  [T1] Polling task_queue...
📋 [T1] Found task: T1 - Fix Theme Colors (priority: 10)
🚀 [T1] Starting: T1 - Fix Theme Colors
📝 [T1] Piping prompt to claude --print...
🔷 [T1] Running: claude --print (headless mode)
[T1] 🎯 I'll fix the theme colors now...
[T1] Updating /app/globals.css...
[T1] Running npm run build...
[T1] ✅ Build successful
[T1] Committing changes...
[T1] Pushing to master...
✅ [T1] Completed: T1 - Fix Theme Colors
📌 Commit: a1b2c3d
```

---

## Troubleshooting

### Worker doesn't find any tasks
- Check that `task_queue` table exists: `SELECT COUNT(*) FROM public.task_queue;`
- Verify Supabase service role key is set: `echo $SUPABASE_SERVICE_ROLE_KEY`
- Check if any tasks are in `pending` status

### Claude Code execution fails
- Verify `claude --print` works manually: `echo "ls -la" | claude --print`
- Check that Claude Code CLI is installed: `which claude`
- Review Claude Code error logs (check stdout/stderr from worker)

### Tasks stuck in `claimed` state
- Worker crashed before completing task
- Manually reset status: `UPDATE task_queue SET status = 'pending' WHERE status = 'claimed' AND claimed_at < NOW() - INTERVAL 5 MINUTES;`

### Multiple workers claim the same task
- Database race condition
- Add application-level locking: check `assigned_terminal` before executing

---

## Production Checklist

- [ ] Migration applied to Supabase
- [ ] Service role key stored securely (env var, not hardcoded)
- [ ] All 8 terminals launched with `claude --dangerously-skip-permissions`
- [ ] API endpoint protected with API key
- [ ] First task dispatched and completed successfully
- [ ] Monitoring in place for stuck/failed tasks

---

## Next Steps

1. **Run migration** in Supabase SQL Editor
2. **Start all 8 workers** with their respective `TERMINAL_ID`
3. **Dispatch first task** via API or DB insert
4. **Monitor** task status and worker output

Once live, you can dispatch tasks from Telegram via JARVIS or Brandon's commands!
