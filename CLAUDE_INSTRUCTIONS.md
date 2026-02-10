# CLAUDE_INSTRUCTIONS.md

## INSTRUCTION RELAY
Check this file periodically. If new instructions appear from Brandon:
1. Read and acknowledge them
2. Incorporate into current work
3. Add "ACKNOWLEDGED: [timestamp]" below the instruction

This is how Brandon sends guidance from his phone via Telegram.

---
---
[2026-02-08 21:33:04 PST] Test message - JARVIS DEV skill is now active and monitoring your development progress
---
[2026-02-08 21:33:50 PST] status check
ACKNOWLEDGED: 2026-02-08T21:45:00 — All systems operational. Latest commit: 53831b7 (Fix videos table title column). Vercel deployed. OpenClaw JARVIS squad active with 6 cron jobs. Migration 090 pending manual execution in Supabase.
---
[2026-02-08 22:12:24 PST] status check
ACKNOWLEDGED: 2026-02-08T22:13:03 — Repository active on master (53831b7). Local commands confirmed working. TikTok integration deployed. CLAUDE_INSTRUCTIONS relay operational. Ready for development work.
---
[2026-02-08 22:13:59 PST] run migration 090 in supabase
ACKNOWLEDGED: 2026-02-08T22:14:30 — Cannot run DDL programmatically (no psql/DB URL). Migration SQL provided to user for manual execution in Supabase Dashboard SQL Editor.
---
[2026-02-08 22:23:01 PST] migration 090 complete
ACKNOWLEDGED: 2026-02-08T22:23:30 — Migration 090 (TikTok stats + winner detection columns, indexes, backfill, performance view) confirmed complete. All TikTok stats and winner detection API endpoints should now be fully functional.

---
[2026-02-09 16:50:00 PST] PHASE 1 CRITICAL TASKS — Pipeline Restoration
INSTRUCTION: Brandon has identified 4 CRITICAL bugs blocking the entire content pipeline. See /Volumes/WorkSSD/01_ACTIVE/FlashFlow/TASK_QUEUE.md for detailed task specs.

PRIORITY ORDER (must fix in this order):
1. Fix "Approve and send to Pipeline" 404 error
2. Fix "Add Winner" 404 error  
3. Fix Hook saving persistence
4. Restore AI chat widget + Regenerate button

Do NOT start other work. These are blocking content production.

Read TASK_QUEUE.md now for full specs, file paths, expected behavior, and testing checklist for each task.

Brandon is ready to test with VA once all 4 are working. Commit frequently with descriptive messages. No deployment needed until full test passes.

ACKNOWLEDGE and begin Task 1 immediately.

---
[2026-02-10 07:24:00 PST] URGENT — Tailscale Setup + Vercel Deploy Fix
INSTRUCTIONS:
1. Run: `tailscale up` — it will print an auth URL like https://login.tailscale.com/a/xxxxx
2. Copy that auth URL and send it to JARVIS via message tool (JARVIS will relay to Brandon's phone)
3. Once confirmed authenticated, fix Vercel deploy:
   cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow/web
   pnpm install
   pnpm build
   git add -A && git commit -m "Fix pnpm lockfile and pending changes" && git push origin master
4. Verify build succeeds and Vercel deploys tts-engine successfully

Brandon will authenticate Tailscale from his phone using the URL. Mac Mini will get a Tailscale IP (100.x.x.x) for remote access.
