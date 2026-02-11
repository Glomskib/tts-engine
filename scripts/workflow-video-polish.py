#!/usr/bin/env python3
"""
Workflow: Recorded video → Polish with effects

Trigger: FlashFlow webhook when status = "recorded"
Input: video_id
Output: Polished video stored in FlashFlow, status changed to "ready_to_post"
"""

import os
import sys
import json
import time
import requests
from datetime import datetime

# API Keys
RUNWAY_KEY = os.getenv("RUNWAY_API_KEY")
FLASHFLOW_KEY = os.getenv("FLASHFLOW_API_KEY")

# API URLs
RUNWAY_API = "https://api.runwayml.com/v1"
FLASHFLOW_API = "https://web-pied-delta-30.vercel.app/api"

def log_message(msg):
    """Print timestamped log"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def get_video(video_id):
    """Fetch video from FlashFlow"""
    log_message(f"Fetching video: {video_id}")
    resp = requests.get(
        f"{FLASHFLOW_API}/videos/{video_id}",
        headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"}
    )
    resp.raise_for_status()
    return resp.json().get("data", resp.json())

def submit_to_runway(video_url):
    """Submit video to Runway for effects processing"""
    log_message(f"Submitting to Runway: {video_url[:50]}...")
    
    resp = requests.post(
        f"{RUNWAY_API}/tasks",
        headers={"Authorization": f"Bearer {RUNWAY_KEY}"},
        json={
            "type": "gen3",
            "input_video": video_url,
            "prompt": "Stabilize footage. Color grade for TikTok - vibrant, high contrast, cinematic. Enhance colors. If footage is static, add subtle slow zoom or pan. Duration should match original."
        }
    )
    resp.raise_for_status()
    result = resp.json().get("data", resp.json())
    task_id = result.get("id")
    log_message(f"Task submitted: {task_id}")
    return task_id

def poll_runway_status(task_id, max_wait_seconds=600):
    """Poll Runway until task completes"""
    log_message(f"Polling Runway task: {task_id}")
    
    start_time = time.time()
    poll_interval = 15  # Check every 15 seconds
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait_seconds:
            raise TimeoutError(f"Runway processing timeout after {max_wait_seconds}s")
        
        resp = requests.get(
            f"{RUNWAY_API}/tasks/{task_id}",
            headers={"Authorization": f"Bearer {RUNWAY_KEY}"}
        )
        resp.raise_for_status()
        result = resp.json().get("data", resp.json())
        status = result.get("status")
        
        log_message(f"Status: {status} (elapsed: {elapsed:.0f}s)")
        
        if status == "completed":
            output_url = result.get("output_video") or result.get("url")
            log_message(f"✅ Runway complete: {output_url[:50]}...")
            return output_url
        
        elif status == "failed":
            raise Exception(f"Runway task failed: {result.get('error', 'Unknown error')}")
        
        # Wait before next poll
        time.sleep(poll_interval)

def download_video(video_url):
    """Download video file"""
    log_message(f"Downloading video: {video_url[:50]}...")
    
    resp = requests.get(video_url)
    resp.raise_for_status()
    
    filename = f"/tmp/polished-{datetime.now().timestamp()}.mp4"
    with open(filename, "wb") as f:
        f.write(resp.content)
    
    log_message(f"Downloaded: {filename}")
    return filename

def upload_to_flashflow(video_id, polished_video_path):
    """Upload polished video to FlashFlow"""
    log_message("Uploading polished video to FlashFlow...")
    
    with open(polished_video_path, "rb") as f:
        files = {"file": f}
        resp = requests.post(
            f"{FLASHFLOW_API}/videos/{video_id}/assets",
            headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"},
            files=files,
            data={"asset_type": "polished_video"}
        )
    resp.raise_for_status()
    result = resp.json().get("data", resp.json())
    return result.get("url") or result.get("polished_video_url")

def update_video_status(video_id, polished_url):
    """Update video status in FlashFlow"""
    log_message("Updating video status...")
    
    resp = requests.patch(
        f"{FLASHFLOW_API}/videos/{video_id}",
        headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"},
        json={
            "polished_video_url": polished_url,
            "status": "ready_to_post",
            "notes": "Video polished with Runway AI. Color-graded, stabilized, ready for posting."
        }
    )
    resp.raise_for_status()
    log_message("✅ Video status updated to ready_to_post")
    return resp.json()

def main(video_id):
    """Main workflow: video polish"""
    try:
        log_message(f"Starting video polish workflow for: {video_id}")
        
        # Step 1: Get video
        video = get_video(video_id)
        raw_video_url = video.get("raw_video_url") or video.get("video_url")
        
        if not raw_video_url:
            raise ValueError(f"No raw_video_url found for video: {video_id}")
        
        # Step 2: Submit to Runway
        task_id = submit_to_runway(raw_video_url)
        
        # Step 3: Poll until complete
        polished_url = poll_runway_status(task_id)
        
        # Step 4: Download polished video
        polished_path = download_video(polished_url)
        
        # Step 5: Upload to FlashFlow
        flashflow_url = upload_to_flashflow(video_id, polished_path)
        
        # Step 6: Update video status
        update_video_status(video_id, flashflow_url)
        
        log_message(f"✅ Workflow complete for video: {video_id}")
        print(json.dumps({
            "status": "success",
            "video_id": video_id,
            "polished_url": flashflow_url
        }))
        
    except Exception as e:
        log_message(f"❌ Error: {str(e)}")
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python workflow-video-polish.py <video_id>")
        sys.exit(1)
    
    video_id = sys.argv[1]
    main(video_id)
