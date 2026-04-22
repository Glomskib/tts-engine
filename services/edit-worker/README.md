# FlashFlow Edit Worker

Pull-based render worker for the Edit Builder. Runs on a Mac mini (or any
always-on box with outbound internet + Supabase service-role credentials).
Polls `render_jobs` for queued work, claims one atomically via the
`claim_render_job` Postgres RPC, runs an ffmpeg-based preview render, and
writes the resulting artifact location back to the row.

Isolated from the legacy `ai_edit_jobs` / Inngest pipeline — this is the new
Edit Builder path only.

## Setup

```bash
cd ~/tts-engine/services/edit-worker
npm install
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optionally EDIT_WORKER_ID
```

## Run

```bash
# One-shot: process one job then exit. Good for local testing.
npm run once

# Daemon: poll forever.
npm run start
```

## Phase 2 scope

Implemented:
- atomic claim via `claim_render_job(worker_id)` RPC (FOR UPDATE SKIP LOCKED)
- capped retries (`render_jobs.max_attempts`, default 3)
- step-by-step logs via `append_render_log` RPC
- preview render: trim segments → concat → scale/crop to 1080x1920 → H.264 MP4
- storage upload to `<bucket>/<user_id>/<project_id>/preview-<job_id>.mp4`
- signed preview URL (7-day) written to `render_jobs.preview_url`
- tenant isolation enforced: worker verifies every source clip belongs to the
  job's `user_id` before rendering

Deferred (Phase 3+):
- caption burn-in
- overlay text (hook_text / cta_text)
- music mixing
- final (high-quality) renders
- heartbeats / worker_nodes auto-registration
- admin UI
- Footage Hub / Ready-to-Post integration

## Local test walkthrough

See `~/PROJECT_AUDITS/EDIT_BUILDER_ARCHITECTURE.md` for the end-to-end walkthrough
(apply migration → seed a project and clip → generate a stub plan → enqueue a
render → run `npm run once` → check `render_jobs.preview_url`).
