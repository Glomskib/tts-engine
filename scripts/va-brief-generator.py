#!/usr/bin/env python3
"""
FlashFlow VA Brief Generator

Auto-generates editing briefs for every SCRIPTED pipeline item.
Reads script from FlashFlow API, creates structured brief,
and optionally updates pipeline status.

Usage:
  python va-brief-generator.py                  # Generate briefs for all SCRIPTED
  python va-brief-generator.py --video-id UUID  # Brief for specific video
  python va-brief-generator.py --assign VA_NAME # Generate and assign to VA
  python va-brief-generator.py --dry-run        # Preview without changes
"""

import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import httpx

# --- Configuration ---

API_URL = "https://web-pied-delta-30.vercel.app/api"
JOURNALS_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"
BRIEFS_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "va-briefs"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger("va-brief-generator")

API_KEY = os.environ.get("FLASHFLOW_API_KEY", "")
if not API_KEY:
    skill_file = Path.home() / ".openclaw" / "agents" / "flashflow-work" / "workspace" / "skills" / "flashflow" / "skill.md"
    if skill_file.exists():
        match = re.search(r"ff_ak_[a-f0-9]{40}", skill_file.read_text())
        if match:
            API_KEY = match.group(0)


def api_call(method: str, endpoint: str, json_body: dict = None, params: dict = None) -> dict:
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    url = f"{API_URL}{endpoint}"
    try:
        if method == "GET":
            resp = httpx.get(url, headers=headers, params=params, timeout=30)
        elif method == "POST":
            resp = httpx.post(url, headers=headers, json=json_body or {}, timeout=30)
        elif method == "PATCH":
            resp = httpx.patch(url, headers=headers, json=json_body or {}, timeout=30)
        else:
            return {"ok": False}
        return {"ok": resp.status_code < 300, "data": resp.json()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def get_scripted_videos() -> list[dict]:
    """Fetch videos with status SCRIPTED from pipeline."""
    r = api_call("GET", "/videos/queue")
    if not r["ok"]:
        log.error(f"Failed to fetch queue: {r.get('error', '')}")
        return []

    videos = r["data"].get("data", [])
    scripted = [v for v in videos if v.get("status", "").lower() in ("scripted", "needs_edit")]
    log.info(f"Found {len(scripted)} scripted videos ready for briefs")
    return scripted


def get_video_detail(video_id: str) -> dict | None:
    """Fetch full video details including script."""
    r = api_call("GET", f"/videos/{video_id}")
    if r["ok"]:
        return r["data"].get("data")
    return None


def extract_script_content(video: dict) -> dict:
    """Extract structured script content from video data."""
    script_text = video.get("script_locked_text", "") or video.get("script_text", "") or ""
    skit_data = video.get("skit_data") or {}

    hook = ""
    beats = []
    cta = ""

    if isinstance(skit_data, dict) and skit_data:
        # Parse skit_data structure
        hook_data = skit_data.get("hook", {})
        if isinstance(hook_data, dict):
            hook = hook_data.get("line", hook_data.get("text", ""))
        elif isinstance(hook_data, str):
            hook = hook_data

        for beat in skit_data.get("beats", []):
            if isinstance(beat, dict):
                beats.append({
                    "action": beat.get("action", ""),
                    "dialogue": beat.get("dialogue", ""),
                    "on_screen": beat.get("on_screen_text", beat.get("onScreenText", "")),
                })

        cta = skit_data.get("cta", "")
        if isinstance(cta, dict):
            cta = cta.get("text", cta.get("line", ""))

    elif script_text:
        # Parse from plain text
        lines = script_text.strip().split("\n")
        if lines:
            hook = lines[0]
        if len(lines) > 1:
            for line in lines[1:]:
                if line.strip():
                    beats.append({"action": "", "dialogue": line.strip(), "on_screen": ""})

    return {"hook": hook, "beats": beats, "cta": cta, "raw": script_text}


def generate_brief(video: dict, script: dict) -> str:
    """Generate a formatted VA editing brief."""
    product_name = ""
    brand_name = ""
    product = video.get("product") or {}
    if isinstance(product, dict):
        product_name = product.get("name", "")
        brand_name = product.get("brand", "")

    title = video.get("title", "Untitled")
    video_id = video.get("id", "")[:8]
    due_date = (datetime.now() + timedelta(days=2)).strftime("%b %d, %Y")

    # Determine editing style based on content type
    content_type = video.get("content_type", "product_showcase")
    style_map = {
        "product_showcase": ("Fast cuts", "Upbeat/trending", "Bold, large"),
        "ugc_testimonial": ("Smooth transitions", "Calm/authentic", "Minimal, clean"),
        "skit_comedy": ("Quick cuts, jump cuts", "Trending/funny", "Bold with effects"),
        "voiceover_explainer": ("B-roll with text", "Background chill", "Text-heavy, educational"),
        "face_on_camera": ("Medium pace", "Subtle background", "CTA overlay bold"),
    }
    pace, music, text_style = style_map.get(content_type, ("Medium", "Trending", "Standard"))

    brief = f"""┌─────────────────────────────────────────┐
│          VIDEO EDITING BRIEF            │
├─────────────────────────────────────────┤
│ Brand:    {brand_name or 'N/A':<30s}│
│ Product:  {product_name or 'N/A':<30s}│
│ Code:     {video_id:<30s}│
│ Due:      {due_date:<30s}│
│ Type:     {content_type:<30s}│
├─────────────────────────────────────────┤
│ HOOK (first 1-3 seconds):              │
│ {script['hook'][:40]:<40s}│"""

    if len(script['hook']) > 40:
        brief += f"\n│ {script['hook'][40:80]:<40s}│"

    brief += f"""
├─────────────────────────────────────────┤
│ SCENES:                                 │"""

    for i, beat in enumerate(script["beats"][:6], 1):
        action = beat.get("action", "")[:35]
        dialogue = beat.get("dialogue", "")[:35]
        on_screen = beat.get("on_screen", "")[:35]
        brief += f"\n│ {i}. Action: {action:<29s}│"
        if dialogue:
            brief += f"\n│    Dialogue: {dialogue:<27s}│"
        if on_screen:
            brief += f"\n│    Text: {on_screen:<31s}│"

    if script["cta"]:
        brief += f"""
├─────────────────────────────────────────┤
│ CTA: {script['cta'][:35]:<35s}│"""

    brief += f"""
├─────────────────────────────────────────┤
│ EDITING NOTES:                          │
│ - Pace:  {pace:<31s}│
│ - Music: {music:<31s}│
│ - Text:  {text_style:<31s}│
│ - Duration: 15-30 seconds               │
│ - Aspect: 9:16 (vertical)               │
├─────────────────────────────────────────┤
│ QUALITY CHECKLIST:                      │
│ □ Hook grabs attention in 1-3 sec       │
│ □ Text readable on mobile               │
│ □ Audio clean (no background noise)     │
│ □ Product clearly visible               │
│ □ CTA present and clear                 │
│ □ 9:16 aspect ratio (vertical)          │
│ □ Trending sound used (if specified)    │
│ □ Video under 60 seconds               │
└─────────────────────────────────────────┘"""

    return brief


def save_brief(video_id: str, brief: str):
    """Save brief to file."""
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    filepath = BRIEFS_DIR / f"{today}-brief-{video_id[:8]}.txt"
    with open(filepath, "w") as f:
        f.write(brief)
    log.info(f"  Brief saved to {filepath}")
    return filepath


def main():
    JOURNALS_DIR.mkdir(parents=True, exist_ok=True)
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)

    if not API_KEY:
        log.error("No FlashFlow API key found")
        sys.exit(1)

    dry_run = "--dry-run" in sys.argv
    assign_to = None
    if "--assign" in sys.argv:
        idx = sys.argv.index("--assign")
        if idx + 1 < len(sys.argv):
            assign_to = sys.argv[idx + 1]

    # Get videos to process
    if "--video-id" in sys.argv:
        idx = sys.argv.index("--video-id")
        if idx + 1 < len(sys.argv):
            video = get_video_detail(sys.argv[idx + 1])
            videos = [video] if video else []
        else:
            videos = []
    else:
        videos = get_scripted_videos()

    if not videos:
        log.info("No scripted videos found. Nothing to do.")
        return

    log.info(f"Generating briefs for {len(videos)} videos...")
    generated = 0

    for video in videos:
        vid = video.get("id", "")
        title = video.get("title", "")[:50]
        log.info(f"\nProcessing: {title} ({vid[:8]})")

        script = extract_script_content(video)
        if not script["hook"] and not script["beats"]:
            log.warning(f"  No script content found, skipping")
            continue

        brief = generate_brief(video, script)
        print(f"\n{brief}\n")

        if not dry_run:
            save_brief(vid, brief)
            generated += 1

    log.info(f"\nDone. Generated {generated} briefs.")

    # Log to journal
    today = datetime.now().strftime("%Y-%m-%d")
    journal = JOURNALS_DIR / f"{today}-va-briefs.md"
    with open(journal, "a") as f:
        f.write(f"\n## VA Briefs — {datetime.now().strftime('%H:%M')}\n")
        f.write(f"- Generated {generated} briefs from {len(videos)} scripted videos\n")


if __name__ == "__main__":
    main()
