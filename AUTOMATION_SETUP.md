# OpenClaw Automation Setup — Replace Make.com with Python Scripts

## Overview

Instead of Make.com, use Python scripts + cron/webhooks to automate the entire FlashFlow content pipeline.

**Architecture:**
```
Event (webhook or cron) → Python script → API calls → FlashFlow update
```

## Scripts Provided

### 1. `workflow-script-generation.py`
**Purpose:** Video needs script → Generate script + thumbnail + voiceover

**Trigger:** Manual or webhook when `status = "needs_script"`

**What it does:**
- Fetch video details
- Research trends (Claude)
- Generate script (Claude 3.5 Sonnet)
- Create thumbnail (Canva AI)
- Generate voiceover (ElevenLabs)
- Update FlashFlow with all assets

**Runtime:** 1-2 minutes per video

### 2. `workflow-video-polish.py`
**Purpose:** Recorded video → Polish with effects → Ready to post

**Trigger:** Webhook when `status = "recorded"`

**What it does:**
- Submit video to Runway
- Poll for completion (async, may take 2-5 min)
- Download polished video
- Upload to FlashFlow
- Update status to `ready_to_post`

**Runtime:** Variable (2-5 min depending on Runway queue)

### 3. `health-check-daily.py`
**Purpose:** Daily morning pipeline health check

**Trigger:** Cron job (8 AM every morning)

**What it does:**
- Fetch all videos
- Count by stage
- Detect stuck/old videos
- Generate alerts
- Send Telegram report

**Runtime:** 30 seconds

---

## Setup Instructions

### Step 1: Install Dependencies

```bash
cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow
pip install requests python-dotenv
```

### Step 2: Configure Environment Variables

Create `.env` file in FlashFlow root:

```bash
# API Keys
ANTHROPIC_API_KEY="sk-ant-..."
ELEVENLABS_API_KEY="..."
CANVA_API_KEY="..."
RUNWAY_API_KEY="..."
FLASHFLOW_API_KEY="ff_ak_..."

# Voice
ELEVENLABS_VOICE_ID="your-voice-id-from-elevenlabs"

# Telegram
TELEGRAM_BOT_TOKEN="...from-bot-father"
BRANDON_CHAT_ID="8287880388"
```

**Get API Keys:**
- Anthropic: https://console.anthropic.com
- ElevenLabs: https://elevenlabs.io/app/settings
- Canva: https://www.canva.com/developers
- Runway: https://app.runwayml.com/api
- FlashFlow: In your FlashFlow dashboard
- Telegram: @BotFather on Telegram

### Step 3: Make Scripts Executable

```bash
chmod +x scripts/workflow-*.py
chmod +x scripts/health-check-*.py
```

### Step 4: Test Locally

#### Test script generation:
```bash
export PYTHONPATH=/Volumes/WorkSSD/01_ACTIVE/FlashFlow
python scripts/workflow-script-generation.py <video-id>
```

Example output:
```json
{
  "status": "success",
  "video_id": "abc-123",
  "script": { "hook": "...", "body": "...", "cta": "..." },
  "thumbnail_url": "https://...",
  "voiceover_url": "uploaded"
}
```

#### Test video polish:
```bash
python scripts/workflow-video-polish.py <video-id>
```

#### Test health check:
```bash
python scripts/health-check-daily.py
```

Should send Telegram message with pipeline status.

---

## Integration Methods

### Option A: Manual Triggers (Today)

**From Telegram:**
```
You: "generate script for video-abc-123"
↓
Claude Code reads message
↓
Runs: python workflow-script-generation.py video-abc-123
↓
Results sent back via Telegram
```

**Implementation:** Add to OpenClaw message handler in Claude Code

### Option B: Webhook Triggers (Better)

**FlashFlow webhook:**
```
When video.status changes to "needs_script"
  → POST to: http://localhost:3000/webhooks/flashflow-automation
  → Body: { "video_id": "...", "event": "needs_script" }
```

**OpenClaw webhook listener (Claude Code):**
```python
@app.post("/webhooks/flashflow-automation")
async def handle_flashflow_event(request):
    body = await request.json()
    video_id = body["video_id"]
    event = body["event"]
    
    if event == "needs_script":
        subprocess.run([
            "python",
            "scripts/workflow-script-generation.py",
            video_id
        ])
    elif event == "recorded":
        subprocess.run([
            "python",
            "scripts/workflow-video-polish.py",
            video_id
        ])
```

### Option C: Scheduled Jobs (Cron)

**Daily health check (8 AM):**
```bash
# Add to crontab
crontab -e

# Add this line:
0 8 * * * cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow && python scripts/health-check-daily.py
```

**Script generation batch (11 PM nightly):**
```bash
# Generate scripts for all "needs_script" videos every night
0 23 * * * cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow && python scripts/batch-generate-scripts.py
```

**Video polish batch (6 AM):**
```bash
# Polish all "recorded" videos early morning (before you wake up)
0 6 * * * cd /Volumes/WorkSSD/01_ACTIVE/FlashFlow && python scripts/batch-polish-videos.py
```

---

## Advanced: Claude Code Integration

### Full Automation via Claude Code

**Claude Code runs continuously.** Wire these scripts into it:

```python
# In CLAUDE_INSTRUCTIONS.md or Claude Code setup

import subprocess
import requests
import os

FLASHFLOW_API = "https://web-pied-delta-30.vercel.app/api"
FLASHFLOW_KEY = os.getenv("FLASHFLOW_API_KEY")

def trigger_script_generation(video_id):
    """Trigger script generation for a video"""
    result = subprocess.run([
        "python",
        "scripts/workflow-script-generation.py",
        video_id
    ], capture_output=True, text=True)
    return json.loads(result.stdout)

def trigger_video_polish(video_id):
    """Trigger video polish"""
    result = subprocess.run([
        "python",
        "scripts/workflow-video-polish.py",
        video_id
    ], capture_output=True, text=True)
    return json.loads(result.stdout)

# Run on heartbeat (every 5 minutes)
def automation_heartbeat():
    """Check for videos needing automation"""
    
    # Get all videos
    resp = requests.get(
        f"{FLASHFLOW_API}/videos",
        headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"}
    )
    videos = resp.json().get("data", [])
    
    # Process each video
    for video in videos:
        status = video.get("status")
        video_id = video.get("id")
        
        if status == "needs_script":
            print(f"Generating script for {video_id}...")
            trigger_script_generation(video_id)
        
        elif status == "recorded":
            print(f"Polishing video {video_id}...")
            trigger_video_polish(video_id)
```

---

## Monitoring & Troubleshooting

### Check Logs

```bash
# View script outputs
tail -f /var/log/automation.log

# Manually run with verbose output
python scripts/workflow-script-generation.py video-id 2>&1 | tee /tmp/run.log
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `missing_brave_api_key` | Perplexity not configured | Use Claude instead of Perplexity for now |
| `401 Unauthorized` | Bad API key | Check `.env` file |
| `429 Too Many Requests` | Rate limited | Add delay between API calls |
| `Timeout` | Runway taking too long | Increase `max_wait_seconds` |

### Performance Metrics

```
Script generation: 1-2 minutes per video
Video polish: 2-5 minutes per video (async)
Health check: 30 seconds
API costs: ~$0.50-1.00 per video (Claude + ElevenLabs + Canva)
```

---

## Cost Analysis

### Monthly Costs (20 videos/month)

| Service | Cost | Usage |
|---------|------|-------|
| Claude Sonnet | $0.50 | 1 script per video |
| ElevenLabs | $5 | VO generation |
| Canva AI | $13 | 1 thumbnail per video |
| Runway Gen-3 | $15 | 1 video polish per video |
| **Total** | **$33.50** | ~20 videos |

**vs Make.com:** $9-99/mo (plus operation fees)
**vs Hiring:** $500-1000 (designer + VA)

**Savings:** 95% vs hiring, comparable to Make.com

---

## Next Steps

### This Week
- [ ] Copy API keys to `.env`
- [ ] Test `workflow-script-generation.py` locally
- [ ] Test `health-check-daily.py`
- [ ] Verify Telegram messages work

### This Month
- [ ] Set up webhook in FlashFlow
- [ ] Wire into Claude Code
- [ ] Add cron jobs for daily checks
- [ ] Monitor performance

### This Quarter
- [ ] Build batch scripts (process multiple videos)
- [ ] Add performance tracking (which scripts run fastest?)
- [ ] Integrate with Metabase (log all automation runs)
- [ ] Scale to 50+ videos/month

---

## Script Customization

All scripts are designed to be modified. Examples:

### Change Runway prompt:
```python
# In workflow-video-polish.py, line ~55
"prompt": "Your custom Runway prompt here"
```

### Change Claude model:
```python
# In workflow-script-generation.py, line ~70
"model": "claude-3-opus-20250219"  # Upgrade to Opus for better quality
```

### Add more status checks:
```python
# In health-check-daily.py, add custom alerts
if analysis["by_status"].get("needs_edit", 0) > 5:
    analysis["alerts"].append("Too many videos in editing queue")
```

---

## Questions?

All scripts have inline comments. Read them!

Each script is designed to be run standalone:
```bash
python scripts/workflow-script-generation.py video-id
```

They output JSON, so you can chain them:
```bash
result=$(python scripts/workflow-script-generation.py video-id)
thumbnail=$(echo $result | jq -r '.thumbnail_url')
```

No Make.com needed. Total control. $0 platform fees.
