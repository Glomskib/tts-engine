#!/usr/bin/env python3
"""
Daily health check: Pipeline status, bottlenecks, alerts

Trigger: Cron job (every morning at 8 AM)
Output: Telegram alert with pipeline status + recommendations
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta

# API Keys
FLASHFLOW_KEY = os.getenv("FLASHFLOW_API_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("BRANDON_CHAT_ID", "8287880388")

# API URLs
FLASHFLOW_API = "https://web-pied-delta-30.vercel.app/api"
TELEGRAM_API = "https://api.telegram.org/bot"

def log_message(msg):
    """Print timestamped log"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def get_all_videos():
    """Fetch all videos from FlashFlow"""
    log_message("Fetching all videos...")
    resp = requests.get(
        f"{FLASHFLOW_API}/videos",
        headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"}
    )
    resp.raise_for_status()
    data = resp.json().get("data", resp.json())
    videos = data if isinstance(data, list) else [data]
    return videos

def analyze_pipeline(videos):
    """Analyze pipeline health"""
    log_message("Analyzing pipeline...")
    
    analysis = {
        "total_videos": len(videos),
        "by_status": {},
        "stuck_videos": [],
        "old_videos": [],
        "alerts": []
    }
    
    # Count by status
    status_counts = {}
    for video in videos:
        status = video.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
    analysis["by_status"] = status_counts
    
    # Find stuck/old videos
    now = datetime.now()
    for video in videos:
        created_at_str = video.get("created_at")
        if not created_at_str:
            continue
        
        try:
            created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            age_hours = (now - created_at).total_seconds() / 3600
            
            status = video.get("status")
            
            # Alert if in same stage for >24h
            if status not in ["posted", "error"] and age_hours > 24:
                analysis["stuck_videos"].append({
                    "id": video.get("id"),
                    "title": video.get("title"),
                    "status": status,
                    "age_hours": age_hours
                })
            
            # Alert if very old (>7 days)
            if status not in ["posted", "error"] and age_hours > 168:
                analysis["old_videos"].append({
                    "id": video.get("id"),
                    "title": video.get("title"),
                    "age_days": age_hours / 24
                })
        except:
            pass
    
    # Generate alerts
    if analysis["stuck_videos"]:
        count = len(analysis["stuck_videos"])
        analysis["alerts"].append(f"🚨 {count} video(s) stuck in same stage >24h")
    
    if analysis["old_videos"]:
        count = len(analysis["old_videos"])
        analysis["alerts"].append(f"⚠️ {count} video(s) >7 days old")
    
    # Alert if bottleneck
    needs_script = analysis["by_status"].get("needs_script", 0)
    if needs_script > 5:
        analysis["alerts"].append(f"⚠️ {needs_script} videos waiting for scripts")
    
    not_recorded = analysis["by_status"].get("not_recorded", 0)
    if not_recorded > 3:
        analysis["alerts"].append(f"⚠️ {not_recorded} videos waiting for recording")
    
    # Alert if content dry spell (no posted videos in next 3 days)
    posted_videos = [v for v in videos if v.get("status") == "posted"]
    if len(posted_videos) == 0 and analysis["total_videos"] < 3:
        analysis["alerts"].append("📉 Content dry spell risk - generate scripts today")
    
    return analysis

def send_telegram_alert(analysis):
    """Send health check report to Telegram"""
    log_message("Sending Telegram alert...")
    
    # Build message
    message = "📊 **Pipeline Health Check**\n\n"
    message += f"**Total Videos:** {analysis['total_videos']}\n\n"
    
    message += "**By Stage:**\n"
    for status, count in analysis["by_status"].items():
        emoji = {
            "needs_script": "📝",
            "not_recorded": "🎬",
            "recorded": "✏️",
            "needs_edit": "🎞️",
            "ready_to_post": "✅",
            "posted": "📤"
        }.get(status, "❓")
        message += f"{emoji} {status.replace('_', ' ').title()}: {count}\n"
    
    message += "\n"
    
    if analysis["alerts"]:
        message += "**Alerts:**\n"
        for alert in analysis["alerts"]:
            message += f"• {alert}\n"
        message += "\n"
    
    if analysis["stuck_videos"]:
        message += "**Stuck Videos:**\n"
        for video in analysis["stuck_videos"][:3]:  # Show top 3
            age = video["age_hours"]
            message += f"• {video['title'][:30]}: {video['status']} ({age:.0f}h)\n"
        message += "\n"
    
    message += "**Recommendations:**\n"
    if analysis["by_status"].get("needs_script", 0) > 0:
        message += "• Generate scripts for waiting videos\n"
    if analysis["by_status"].get("not_recorded", 0) > 0:
        message += "• Record waiting videos\n"
    if analysis["by_status"].get("needs_edit", 0) > 2:
        message += "• Prioritize editing\n"
    if not any(v["status"] == "posted" for v in analysis.get("old_videos", [])):
        message += "• Schedule next posting batch\n"
    
    # Send to Telegram
    url = f"{TELEGRAM_API}{TELEGRAM_BOT_TOKEN}/sendMessage"
    resp = requests.post(
        url,
        json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "Markdown"
        }
    )
    resp.raise_for_status()
    log_message("✅ Alert sent to Telegram")
    return resp.json()

def main():
    """Main health check"""
    try:
        log_message("Starting daily health check")
        
        # Step 1: Fetch all videos
        videos = get_all_videos()
        
        # Step 2: Analyze pipeline
        analysis = analyze_pipeline(videos)
        
        # Step 3: Send alert
        send_telegram_alert(analysis)
        
        log_message(f"✅ Health check complete")
        print(json.dumps({
            "status": "success",
            "analysis": analysis
        }))
        
    except Exception as e:
        log_message(f"❌ Error: {str(e)}")
        print(json.dumps({"status": "error", "error": str(e)}))
        # Don't exit with error - let Telegram know there was an issue
        try:
            requests.post(
                f"{TELEGRAM_API}{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": TELEGRAM_CHAT_ID,
                    "text": f"⚠️ Health check failed: {str(e)}"
                }
            )
        except:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()
