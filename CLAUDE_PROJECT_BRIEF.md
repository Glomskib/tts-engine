# Claude Project Brief — FlashFlow AI Automation Expansion

## Mission

Transform FlashFlow from a manual content pipeline into a **fully autonomous AI-powered system** where:
- Product photos → Winners Bank (automated vision analysis)
- Scripts → Thumbnails + Voiceovers (automated)
- Raw videos → Polished content (automated)
- Pipeline health → Daily Telegram alerts (automated)

**Goal:** 80% reduction in manual content work by Q2 2026

---

## Current Status

### What Works ✅
- FlashFlow pipeline (videos table, statuses, workflow)
- TikTok Shop integration
- Basic API endpoints
- Supabase database

### What We're Adding 🚀
- **Vision Import Skill** — Product photos → Winners Bank
- **AI Tool Integrations** — Claude, Canva, ElevenLabs, Runway, Perplexity
- **Python Automation Scripts** — Replace Make.com with local workflows
- **OpenClaw Integration** — Telegram commands + webhooks
- **Daily Health Checks** — Pipeline monitoring + alerts

---

## Project Breakdown by Phase

## PHASE 1: Vision Import (PRIORITY — This Week)

### What: Product Photo Analysis
Brandon sends a product photo on Telegram → JARVIS analyzes it → Creates Winners Bank entry

### Skill File
**Location:** `~/.openclaw/workspace/skills/vision-import.md`
**Status:** ✅ Written (7.5KB)

### How It Works
```
User: Sends product photo to Telegram
  ↓
JARVIS receives image
  ↓
Claude Vision API analyzes:
  - Brand/creator
  - Product category (niche)
  - Pain point solved
  - Selling point
  - 3 hook concepts
  ↓
JARVIS creates Winners entry (or Pipeline entry)
  ↓
Telegram reply: "✅ Added to Winners. Hook: ..."
```

### Exact Requirements
- **Claude Vision:** Already available (use your model)
- **FlashFlow API endpoint:** `/api/winners/submit` (create saved hook)
- **Alternative:** `/api/videos/import/create` (full pipeline entry)
- **Input:** Image path from Telegram
- **Output:** Hook text + metadata saved to database

### Implementation Steps
1. Read skill file (you know what to do)
2. When image arrives + context ("analyze", "add to pipeline"):
   - Use Claude vision API to analyze product
   - Extract: brand, category, pain point, selling point, hook
   - Call `/api/winners/submit` with hook + metadata
   - Send Telegram confirmation
3. Test with 1 real product photo

### Success Criteria
- Receive product photo
- Generate hook in <30 seconds
- Hook is compelling + TikTok-ready
- Entry saved to FlashFlow database

---

## PHASE 2: Script Generation Automation (This Week/Next)

### What: Video needs script → Auto-generate script + thumbnail + voiceover

### Script Location
**File:** `scripts/workflow-script-generation.py` (8.5KB)
**Status:** ✅ Written

### What It Does
```
Trigger: Video status = "needs_script" (webhook or manual)
  ↓
Step 1: Fetch video details from FlashFlow
  ↓
Step 2: Research trends using Claude (no Perplexity yet)
  ↓
Step 3: Generate script (Claude 3.5 Sonnet)
  ↓
Step 4: Create thumbnail (Canva AI)
  ↓
Step 5: Generate voiceover (ElevenLabs)
  ↓
Step 6: Upload all assets to FlashFlow
  ↓
Output: Video ready for VA recording (status: "not_recorded")
```

### Exact Requirements

**API Keys Needed:**
- `ANTHROPIC_API_KEY` — Claude API
- `ELEVENLABS_API_KEY` — Voice generation
- `CANVA_API_KEY` — Thumbnail design
- `FLASHFLOW_API_KEY` — FlashFlow API

**Store in:** `.env` file in FlashFlow root

**Dependencies:** `pip install requests`

**Run Command:**
```bash
python scripts/workflow-script-generation.py <video_id>
```

**Output:**
```json
{
  "status": "success",
  "script": {
    "hook": "String (5-10 words)",
    "body": "String (20-30 words)",
    "cta": "String (5-10 words)",
    "scenes": [{"duration": 3, "action": "..."}]
  },
  "thumbnail_url": "https://...",
  "voiceover_url": "uploaded"
}
```

### Implementation Steps
1. Add API keys to `.env`
2. Test script locally: `python scripts/workflow-script-generation.py test-video-id`
3. Verify output (script, thumbnail, VO)
4. Wire to webhook or manual trigger
5. Test with real video

### Success Criteria
- Script generates in <2 minutes
- Hook is catchy and specific to product
- Thumbnail is professional and eye-catching
- Voiceover is clear and natural-sounding
- All assets upload to FlashFlow successfully

---

## PHASE 3: Video Polish Automation (This Week/Next)

### What: Recorded video → Polish with effects → Ready to post

### Script Location
**File:** `scripts/workflow-video-polish.py` (6KB)
**Status:** ✅ Written

### What It Does
```
Trigger: Video status = "recorded" (webhook)
  ↓
Step 1: Get raw video URL from FlashFlow
  ↓
Step 2: Submit to Runway Gen-3 for effects
  ↓
Step 3: Poll Runway status (2-5 min processing)
  ↓
Step 4: Download polished video
  ↓
Step 5: Upload to FlashFlow
  ↓
Step 6: Update status to "ready_to_post"
```

### Exact Requirements

**API Keys:**
- `RUNWAY_API_KEY` — Video effects
- `FLASHFLOW_API_KEY` — FlashFlow API

**Runway effects applied:**
- Stabilize footage
- Color grade (cinematic, TikTok-ready)
- Enhance colors
- Add subtle motion (if static)

**Run Command:**
```bash
python scripts/workflow-video-polish.py <video_id>
```

**Processing Time:** 2-5 minutes (async, Runway queues requests)

### Implementation Steps
1. Add `RUNWAY_API_KEY` to `.env`
2. Test with recorded video: `python scripts/workflow-video-polish.py video-id`
3. Monitor polling (will wait up to 10 min)
4. Verify polished video quality
5. Wire to webhook (triggered automatically)

### Success Criteria
- Video processes without errors
- Output is noticeably better (stabilized, color-graded)
- Upload completes successfully
- Status updates automatically

---

## PHASE 4: Daily Health Checks (This Week)

### What: Every morning (8 AM) → Pipeline status report + alerts

### Script Location
**File:** `scripts/health-check-daily.py` (7KB)
**Status:** ✅ Written

### What It Does
```
Trigger: Cron job (8 AM daily)
  ↓
Step 1: Fetch all videos from FlashFlow
  ↓
Step 2: Analyze pipeline:
  - Count videos by stage
  - Detect stuck videos (>24h same status)
  - Detect old videos (>7 days)
  - Check for bottlenecks
  ↓
Step 3: Generate alerts:
  - "3 videos stuck in editing"
  - "5 videos waiting for scripts"
  - "Content dry spell in 2 days"
  ↓
Step 4: Send Telegram message to Brandon
```

### Exact Requirements

**API Keys:**
- `FLASHFLOW_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `BRANDON_CHAT_ID` (8287880388)

**Run Command:**
```bash
python scripts/health-check-daily.py
```

**Cron Setup:**
```bash
crontab -e
# Add: 0 8 * * * cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow && python scripts/health-check-daily.py
```

### Implementation Steps
1. Add API keys to `.env`
2. Test locally: `python scripts/health-check-daily.py`
3. Verify Telegram message arrives
4. Add to crontab for 8 AM trigger
5. Monitor for false alerts

### Success Criteria
- Runs every morning at 8 AM
- Telegram message received
- Alerts are accurate
- No false positives

---

## PHASE 5: Integration with Claude Code (This Week/Next)

### What: Wire all scripts into Claude Code for hands-free automation

### How It Works

**Option 1: Manual Trigger (Today)**
```
You: "generate script for video-abc"
  ↓
Claude Code: Reads instruction via CLAUDE_INSTRUCTIONS.md
  ↓
Runs: python workflow-script-generation.py video-abc
  ↓
Returns: Results to Telegram
```

**Option 2: Webhook Trigger (Better)**
```
FlashFlow: Video status changes to "needs_script"
  ↓
POST webhook to: http://localhost:3000/webhooks/automation
  ↓
Claude Code: Receives event
  ↓
Spawns: python workflow-script-generation.py
  ↓
Done (status updated automatically)
```

**Option 3: Heartbeat Polling (Claude Code runs every 5 min)**
```
Claude Code heartbeat: Check for videos needing automation
  ↓
SELECT * FROM videos WHERE status = "needs_script"
  ↓
For each: trigger workflow-script-generation.py
  ↓
Process all waiting videos automatically
```

### Exact Requirements
- Modify Claude Code to:
  - Monitor for videos needing automation
  - Call Python scripts with subprocess
  - Handle async operations (especially Runway)
  - Report progress to Telegram
- Set up webhook endpoint (if using Option 2)
- Add environment variables to Claude Code startup

### Implementation Steps
1. Choose integration option (heartbeat easiest)
2. Add script to Claude Code startup
3. Test with 1 real video
4. Monitor performance
5. Scale to full automation

### Success Criteria
- Scripts run automatically
- No manual intervention needed
- Progress reported to Telegram
- Errors caught and reported

---

## PHASE 6: Automation Workflows Setup (Next Week)

### What: Configure all automation per AUTOMATION_SETUP.md

**File:** `/Volumes/WorkSSD/01_ACTIVE/FlashFlow/AUTOMATION_SETUP.md` (9KB)
**Status:** ✅ Written

### Checklist
- [ ] All API keys in `.env`
- [ ] Test each script locally
- [ ] Verify webhook integration
- [ ] Add cron jobs
- [ ] Monitor for 1 week
- [ ] Document any issues
- [ ] Scale to batch processing

### Success Criteria
- All 3 scripts run reliably
- No manual work for script generation
- No manual work for video polish
- Daily health check alerts
- <1 error per 100 automation runs

---

## Tools & Resources

### Skill Files (How-To Guides)
- `vision-import.md` — Product photo analysis
- `trend-research.md` — Perplexity integration
- `opus-clips.md` — Auto-clip generation
- `elevenlabs-voice.md` — Voice cloning
- `analytics-dashboard.md` — Metabase setup
- `thumbnail-generation.md` — Canva AI
- `video-effects.md` — Runway effects
- `automation-workflows.md` — Make.com (now Python)

### Scripts (Executable)
- `workflow-script-generation.py` — Generate scripts
- `workflow-video-polish.py` — Polish videos
- `health-check-daily.py` — Daily reports
- (Later: batch variants for processing multiple videos)

### Configuration
- `.env` — API keys
- `AUTOMATION_SETUP.md` — Detailed setup guide
- Crontab — Scheduled tasks

---

## Timeline & Dependencies

### This Week (Feb 10-14)
- [ ] Phase 1: Vision Import skill (1 day)
- [ ] Phase 2: Script generation script (1 day)
- [ ] Phase 3: Video polish script (0.5 day)
- [ ] Phase 4: Health check cron (0.5 day)
- [ ] Phase 5: Claude Code integration (2 days)
- [ ] Testing & debugging (1 day)

### Next Week (Feb 17-21)
- [ ] Phase 6: Full workflow setup
- [ ] Monitor automation for reliability
- [ ] Add batch processing
- [ ] Document learnings
- [ ] Plan Phase 2 enhancements

### Phase 2 Enhancements (Feb 24+)
- [ ] Metabase dashboard (analytics)
- [ ] Opus Clip integration (auto-shorts)
- [ ] Perplexity real-time trends
- [ ] Make.com → full workflow orchestration
- [ ] Multi-video batch processing

---

## Success Metrics

### By End of Week 1
- ✅ Vision import working (product photo → Winners)
- ✅ Script generation working (1-2 min per video)
- ✅ Daily health checks running
- ✅ No manual work for 3 core tasks

### By End of Month
- ✅ 20+ videos processed automatically
- ✅ <5% error rate
- ✅ Pipeline bottlenecks identified + fixed
- ✅ Time savings: 5+ hours/week

### By End of Q1
- ✅ 50+ videos fully automated
- ✅ Hands-free content creation pipeline
- ✅ Revenue tracking + performance analytics
- ✅ Ready to scale to 100+ videos/month

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| API failures (Claude, Canva, etc.) | Script fails | Add retry logic, fallbacks |
| Missing API keys | Scripts can't run | Document all keys needed |
| Rate limiting | Processing slows | Batch requests, add delays |
| Runway slow | Long waits | Async polling, user notification |
| Poor script quality | Hooks don't convert | A/B test prompts, adjust |
| Database connection issues | Webhooks fail | Test locally first, error logging |

---

## Notes for Claude Code

### What You Need to Know
1. **You're automating the entire content pipeline**
2. **3 Python scripts do the heavy lifting** (not you)
3. **Your job is to orchestrate them** (run them, monitor, report)
4. **Telegram is your communication channel** (report status, alerts, errors)

### What Scripts Do
1. **Script generation** — Takes 1-2 min, calls multiple APIs
2. **Video polish** — Takes 2-5 min, waits for Runway to process
3. **Health check** — Takes 30 sec, reports pipeline status

### How to Run Them
```python
import subprocess
import json

result = subprocess.run([
    "python",
    "scripts/workflow-script-generation.py",
    video_id
], capture_output=True, text=True)

output = json.loads(result.stdout)
if output["status"] == "success":
    print(f"✅ Script generated: {output['script']['hook']}")
else:
    print(f"❌ Error: {output['error']}")
```

### Error Handling
- Catch subprocess errors
- Log to file + Telegram
- Retry failed operations (3 attempts max)
- Don't fail silently

### Monitoring
- Track script execution times
- Count successes vs failures
- Alert if error rate > 5%
- Daily summary to Telegram

### Performance Goals
- Script generation: <2 min per video
- Video polish: <5 min per video (async)
- Health check: <30 sec
- Overall: <10 min for typical batch

---

## Questions? Ask in CLAUDE_INSTRUCTIONS.md

When you have questions:
1. Check this brief
2. Check skill files
3. Check script code (commented)
4. Ask Brandon via CLAUDE_INSTRUCTIONS.md

This is your roadmap. Execute it. ✅
