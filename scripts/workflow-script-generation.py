#!/usr/bin/env python3
"""
Workflow: Video needs script → Generate script + assets

Trigger: FlashFlow webhook or manual call
Input: video_id
Output: Script, thumbnail URL, VO file URL stored in FlashFlow
"""

import os
import sys
import json
import requests
from datetime import datetime
from pathlib import Path

# API Keys (from env variables)
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
ELEVENLABS_KEY = os.getenv("ELEVENLABS_API_KEY")
CANVA_KEY = os.getenv("CANVA_API_KEY")
FLASHFLOW_KEY = os.getenv("FLASHFLOW_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "default")

# API URLs
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
FLASHFLOW_API = "https://web-pied-delta-30.vercel.app/api"
ELEVENLABS_API = "https://api.elevenlabs.io/v1"
CANVA_API = "https://api.canva.com/v1"

def log_message(msg):
    """Print timestamped log"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def get_video(video_id):
    """Fetch video details from FlashFlow"""
    log_message(f"Fetching video: {video_id}")
    resp = requests.get(
        f"{FLASHFLOW_API}/videos/{video_id}",
        headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"}
    )
    resp.raise_for_status()
    return resp.json().get("data", resp.json())

def get_trends(category):
    """Research trends using Perplexity (or Claude with web search)"""
    log_message(f"Researching trends for: {category}")
    
    # For now, use Claude with a prompt (requires Perplexity integration later)
    resp = requests.post(
        ANTHROPIC_URL,
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        json={
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 500,
            "messages": [
                {
                    "role": "user",
                    "content": f"What are the top 3 trending hooks/angles for {category} on TikTok right now? Be specific and actionable. Format as: 1. [hook] 2. [hook] 3. [hook]"
                }
            ]
        }
    )
    resp.raise_for_status()
    trends = resp.json()["content"][0]["text"]
    log_message(f"Trends: {trends[:100]}...")
    return trends

def generate_script(video):
    """Generate script using Claude"""
    log_message(f"Generating script for: {video.get('title', 'Unknown')}")
    
    trends = get_trends(video.get("category", "general"))
    
    prompt = f"""Generate a TikTok video script for this product:

Product: {video.get('title', 'Unknown')}
Description: {video.get('description', '')}
Category: {video.get('category', '')}
Trending angles: {trends}

Output ONLY valid JSON (no markdown) with this structure:
{{
  "hook": "Opening line (5-10 words, grabs attention)",
  "body": "Main explanation (20-30 words, explain the benefit)",
  "cta": "Call to action (5-10 words)",
  "scenes": [
    {{"duration": 3, "action": "Show product close-up"}},
    {{"duration": 2, "action": "Demonstrate benefit"}},
    {{"duration": 2, "action": "Show it in use"}}
  ]
}}

Generate exactly this structure. No explanations."""

    resp = requests.post(
        ANTHROPIC_URL,
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        json={
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 800,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        }
    )
    resp.raise_for_status()
    script_text = resp.json()["content"][0]["text"]
    
    # Parse JSON
    try:
        script = json.loads(script_text)
    except json.JSONDecodeError:
        # If JSON parse fails, extract JSON from response
        import re
        json_match = re.search(r'\{.*\}', script_text, re.DOTALL)
        if json_match:
            script = json.loads(json_match.group())
        else:
            raise ValueError(f"Failed to parse script JSON: {script_text}")
    
    log_message(f"Script generated. Hook: {script.get('hook', 'N/A')[:50]}...")
    return script

def generate_thumbnail(video, script):
    """Generate thumbnail using Canva AI"""
    log_message("Generating thumbnail...")
    
    hook = script.get("hook", "Check this out")
    
    resp = requests.post(
        f"{CANVA_API}/designs",
        headers={"Authorization": f"Bearer {CANVA_KEY}"},
        json={
            "design_type": "social_media_post",
            "preset": "tiktok",
            "title": f"{video.get('title', 'Product')} Thumbnail",
            "brief": f"Create TikTok thumbnail for {video.get('title', 'product')}. Hook: '{hook}'. Style: modern, minimal, high contrast. Make it eye-catching and readable at 50px."
        }
    )
    resp.raise_for_status()
    result = resp.json().get("data", resp.json())
    thumbnail_url = result.get("image_url") or result.get("url")
    
    log_message(f"Thumbnail created: {thumbnail_url[:50]}...")
    return thumbnail_url

def generate_voiceover(script):
    """Generate voiceover using ElevenLabs"""
    log_message("Generating voiceover...")
    
    text = f"{script.get('hook', '')} {script.get('body', '')} {script.get('cta', '')}"
    
    resp = requests.post(
        f"{ELEVENLABS_API}/text-to-speech/{ELEVENLABS_VOICE_ID}",
        headers={"xi-api-key": ELEVENLABS_KEY},
        json={
            "text": text,
            "voice_settings": {
                "stability": 0.8,
                "similarity_boost": 0.85
            }
        }
    )
    resp.raise_for_status()
    
    # Save audio file
    audio_path = f"/tmp/voiceover-{datetime.now().timestamp()}.mp3"
    with open(audio_path, "wb") as f:
        f.write(resp.content)
    
    log_message(f"Voiceover saved: {audio_path}")
    return audio_path

def upload_asset(video_id, asset_path, asset_type):
    """Upload asset to FlashFlow"""
    log_message(f"Uploading {asset_type}...")
    
    with open(asset_path, "rb") as f:
        files = {"file": f}
        resp = requests.post(
            f"{FLASHFLOW_API}/videos/{video_id}/assets",
            headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"},
            files=files,
            data={"asset_type": asset_type}
        )
    resp.raise_for_status()
    return resp.json().get("data", resp.json())

def update_video(video_id, script, thumbnail_url, voiceover_path):
    """Update video in FlashFlow with generated assets"""
    log_message("Updating video with assets...")
    
    # Upload voiceover
    voiceover_result = upload_asset(video_id, voiceover_path, "voiceover")
    voiceover_url = voiceover_result.get("url") or voiceover_result.get("voiceover_url")
    
    # Update video metadata
    resp = requests.patch(
        f"{FLASHFLOW_API}/videos/{video_id}",
        headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"},
        json={
            "script_content": script,
            "thumbnail_url": thumbnail_url,
            "voiceover_url": voiceover_url,
            "status": "not_recorded",
            "notes": "Script + assets auto-generated via automation. Ready for VA recording."
        }
    )
    resp.raise_for_status()
    log_message("Video updated successfully")
    return resp.json()

def main(video_id):
    """Main workflow: script generation"""
    try:
        log_message(f"Starting script generation workflow for video: {video_id}")
        
        # Step 1: Get video
        video = get_video(video_id)
        
        # Step 2: Generate script
        script = generate_script(video)
        
        # Step 3: Generate thumbnail
        thumbnail_url = generate_thumbnail(video, script)
        
        # Step 4: Generate voiceover
        voiceover_path = generate_voiceover(script)
        
        # Step 5: Update video with all assets
        update_video(video_id, script, thumbnail_url, voiceover_path)
        
        log_message(f"✅ Workflow complete for video: {video_id}")
        print(json.dumps({
            "status": "success",
            "video_id": video_id,
            "script": script,
            "thumbnail_url": thumbnail_url,
            "voiceover_url": "uploaded"
        }))
        
    except Exception as e:
        log_message(f"❌ Error: {str(e)}")
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python workflow-script-generation.py <video_id>")
        sys.exit(1)
    
    video_id = sys.argv[1]
    main(video_id)
