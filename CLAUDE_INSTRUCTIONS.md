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

---
[2026-02-10 07:52:00 PST] CRITICAL FEATURE: TikTok Winner Import System
INSTRUCTION: Build the complete TikTok → Winners Bank → Pipeline workflow. This is a core feature that will become Brandon's primary content discovery method.

PART 1: TikTok URL Scraper API Endpoint
Create: web/app/api/winners/import-tiktok/route.ts
POST /api/winners/import-tiktok
Body: { url: string, brand_name?: string, product_name?: string }

Steps:
1. Extract video ID from TikTok URL (handle multiple formats: tiktok.com/@user/video/123, vm.tiktok.com/xxxxx, etc.)
2. Fetch metadata via TikTok oEmbed: https://www.tiktok.com/oembed?url={encoded_url}
   Returns: title, author_name, author_url, thumbnail_url
3. If brand_name provided: lookup or create brand in products table
4. If product_name provided: lookup or create product
5. Create winner entry in winners/saved_hooks:
   - hook: extracted from title/description
   - source_type: "tiktok_import"
   - source_url: the TikTok URL
   - creator: author_name
   - notes: "Imported from TikTok"
6. Return: { winner_id, brand, product, title, author, hook }

PART 2: Transcription Endpoint
Create: web/app/api/ai/transcribe/route.ts
POST /api/ai/transcribe
Body: { tiktok_url: string, use_title_as_script?: boolean }

Transcription strategy:
- Use Anthropic API (Claude 3.5) with TikTok title + description as context
- Ask Claude to generate a likely video script/hook based on the content, style, and title
- If use_title_as_script=true, use title as the hook directly
- Return: { transcript: string, hook: string, scenes: [], summary: string }

PART 3: Auto-Pipeline Entry Creation
Create: web/app/api/pipeline/from-winner/route.ts
POST /api/pipeline/from-winner
Body: { winner_id: string, transcript?: string }

Steps:
1. Fetch winner record by ID
2. Parse transcript into script structure (hook, scenes, CTA)
3. Create video entry with:
   - status: "SCRIPTED"
   - script_content: generated script from transcript
   - source: "winner_import"
   - notes: "Auto-generated from TikTok winner"
   - assigned_to: null (unassigned, ready for VA)
4. Return: { video_id, status, hook, product, brand }

PART 4: Admin Import Page
Create: web/app/admin/winners/import/page.tsx
Features:
- URL input (paste TikTok link)
- Brand dropdown with "+ Create New" option
- Product dropdown with "+ Create New" option
- "Fetch & Preview" button
- Shows: video metadata, extracted hook, thumbnail
- "Confirm & Add" button triggers both API calls
- Success toast: "✅ Added to Winners + Pipeline"

Also add "Quick Import" floating button on /admin/winners/bank:
- Floating action button (bottom right)
- Opens modal with just URL field
- Minimal, rapid-fire import

PART 5: Bolt Skill Command
Create/update: ~/.openclaw/workspace/skills/flashflow/import-tiktok.md
Expose command: "add winner [URL]" or "import [URL]"
Flow:
1. Extract URL from message
2. POST /api/winners/import-tiktok (without brand/product first)
3. If no brand in response, ask: "Brand name? (or skip to use creator name)"
4. If no product, ask: "Product name? (or skip)"
5. Re-call endpoint with brand/product if provided
6. POST /api/pipeline/from-winner with winner_id
7. Return: "✅ Added! Hook: [text] | Winner ID: [id] | Pipeline: [video_id]"

AUTHENTICATION & DEPENDENCIES:
- Use existing API key auth pattern from other endpoints
- Verify replicate & anthropic deps are in package.json
- Handle errors: invalid URL, brand/product creation failures, API rate limits

COMMIT PATTERN:
- Part 1: "feat: TikTok winner import scraper endpoint"
- Part 2: "feat: Transcription endpoint with AI script generation"
- Part 3: "feat: Auto-pipeline entry creation from winners"
- Part 4: "feat: Admin UI for TikTok winner import"
- Part 5: "feat: Bolt skill for quick winner import command"

Final: git push origin master and notify Brandon once all 5 parts deployed to Vercel.

ACKNOWLEDGE and begin Part 1 immediately.

---
[2026-02-11 06:08:00 PST] TASK: Analytics Screenshot Reader
INSTRUCTION: Build analytics extraction system for TikTok video stats. This enables bulk screenshot uploads to auto-populate video metrics + winner detection.

TASK OVERVIEW:
1. /api/analytics/screenshot endpoint — accepts image upload
2. Sends to Claude Vision API with prompt: "Extract all analytics data from this TikTok screenshot: views, likes, comments, shares, gender %, age brackets %, locations %, follower vs non-follower ratio"
3. Returns structured JSON with all extracted data
4. Auto-matches to a video in pipeline (by user selection or fuzzy match on title)
5. Updates video stats in database
6. If engagement > threshold, auto-add to Winners Bank
7. Creates/updates product demographic profile from the data
8. /admin/analytics/upload page — drag and drop screenshots
9. Bolt skill: user sends screenshot on Telegram → same processing
10. Batch upload: drop 10 screenshots, process all at once

PARTS:
- Part 1: API endpoint with Claude Vision integration
- Part 2: Video matching logic (user selection + fuzzy match fallback)
- Part 3: Admin upload UI (single + batch)
- Part 4: Bolt skill for Telegram screenshot relay
- Part 5: Auto-winner detection threshold + Winners Bank insertion

Add to queue when weekly limit resets. Not urgent, but high-value for scaling content production.

---
[2026-02-13 15:12:00 PST] DAILY SUMMARY FROM JARVIS — Friday, Feb 13, 2026
OVERVIEW OF TODAY'S WORK (for your records):

**MORNING (8 AM):**
- Deployed 7 code fixes overnight — all working
- Fixed code errors (0 remaining)
- Video pipeline tested end-to-end, working
- Google Drive sync ready
- Creatine product library done
- BOLT found 10 trending products (research complete)

**CRASH ALERT (11:42 AM):**
- Database went down overnight
- 24 videos stuck in "needs editing" state
- L2 is investigating (code checks out fine)
- Brandon asked for 3 videos IDs to unblock work
- Waiting on database to come back online

**RESEARCH (11 AM):**
- Focus on 1 product deeply (25 hook variations) > spreading thin across many
- Reuse videos on TikTok, YouTube Shorts, Instagram Reels = 3x more reach, same video
- Email subscribers more valuable than new followers (repeat sales)
- Test: UFORU deep-dive, 25 hook variations, email nurture by Monday

**CONTENT STUDY (1 PM):**
- Analyzed Bodywise Hair Serum video (Brandon sent it)
- Approach: Weird AI character opens it → shows ingredients with names → shows stars/sold count → price options
- Same style could work for creatine (AI explains *why* each ingredient matters)

**CURRENT STATUS:**
- FlashFlow: Empty, waiting for database to come back
- Zebby's World: Dev working
- Notion: Still being built
- POD Shop: Waiting for scripts

**BLOCKED ON:**
- Database needs to be restored by L2
- Brandon's evening wrap input (what shipped, what's blocked, top 3 priorities tomorrow)

**YOUR NEXT STEPS:**
- Wait for database fix (no code work right now)
- Be ready to deploy fixes once database is live
- Consider TikTok Winner Import feature once things stabilize
