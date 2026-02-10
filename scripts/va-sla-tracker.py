#!/usr/bin/env python3
"""
FlashFlow VA SLA Tracker

Tracks time from ASSIGNED → SUBMITTED for each video.
Calculates average edit times per VA, alerts on 24h+ stuck items,
and generates weekly performance reports.

Usage:
  python va-sla-tracker.py                 # Show current SLA status
  python va-sla-tracker.py --alerts        # Show only overdue items
  python va-sla-tracker.py --report        # Generate weekly report
  python va-sla-tracker.py --daemon        # Monitor continuously
"""

import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

# --- Configuration ---

API_URL = "https://web-pied-delta-30.vercel.app/api"
JOURNALS_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"
BUSINESS_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "business"
STATE_PATH = Path(__file__).parent / ".va-sla-state.json"

SLA_THRESHOLDS = {
    "assigned_to_editing": timedelta(hours=4),    # VA should start within 4h
    "editing_to_review": timedelta(hours=24),     # Edit should complete within 24h
    "review_to_approved": timedelta(hours=8),     # Brandon should review within 8h
    "total_turnaround": timedelta(hours=48),      # Total ASSIGNED→POSTED under 48h
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger("va-sla-tracker")

API_KEY = os.environ.get("FLASHFLOW_API_KEY", "")
if not API_KEY:
    skill_file = Path.home() / ".openclaw" / "agents" / "flashflow-work" / "workspace" / "skills" / "flashflow" / "skill.md"
    if skill_file.exists():
        match = re.search(r"ff_ak_[a-f0-9]{40}", skill_file.read_text())
        if match:
            API_KEY = match.group(0)


def api_call(method: str, endpoint: str, params: dict = None) -> dict:
    headers = {"Authorization": f"Bearer {API_KEY}"}
    url = f"{API_URL}{endpoint}"
    try:
        resp = httpx.get(url, headers=headers, params=params, timeout=30) if method == "GET" else None
        if resp and resp.status_code < 300:
            return {"ok": True, "data": resp.json()}
        return {"ok": False, "status": resp.status_code if resp else 0}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def load_state() -> dict:
    if STATE_PATH.exists():
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"tracking": {}, "alerts_sent": {}}


def save_state(state: dict):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2, default=str)


def get_pipeline_videos() -> list[dict]:
    """Get all videos from pipeline."""
    r = api_call("GET", "/videos/queue")
    if r["ok"]:
        return r["data"].get("data", [])
    return []


def parse_timestamp(ts: str | None) -> datetime | None:
    """Parse ISO timestamp."""
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


def calculate_sla_metrics(videos: list[dict]) -> dict:
    """Calculate SLA metrics for all videos."""
    now = datetime.now(timezone.utc)
    metrics = {
        "total_assigned": 0,
        "total_editing": 0,
        "total_review": 0,
        "overdue": [],
        "on_track": [],
        "completed": [],
        "avg_edit_times": {},
        "va_performance": {},
    }

    for video in videos:
        status = (video.get("status") or "").lower()
        vid = video.get("id", "")
        title = video.get("title", "")[:50]
        assigned_to = video.get("assigned_to_name") or video.get("assigned_to", "")
        last_changed = parse_timestamp(video.get("last_status_changed_at"))
        created = parse_timestamp(video.get("created_at"))

        if status == "assigned":
            metrics["total_assigned"] += 1
            if last_changed:
                elapsed = now - last_changed
                entry = {
                    "id": vid,
                    "title": title,
                    "status": status,
                    "assigned_to": assigned_to,
                    "elapsed": elapsed,
                    "elapsed_hours": elapsed.total_seconds() / 3600,
                }
                if elapsed > SLA_THRESHOLDS["assigned_to_editing"]:
                    entry["sla_breach"] = "Not started within 4h"
                    metrics["overdue"].append(entry)
                else:
                    metrics["on_track"].append(entry)

        elif status == "editing":
            metrics["total_editing"] += 1
            if last_changed:
                elapsed = now - last_changed
                entry = {
                    "id": vid,
                    "title": title,
                    "status": status,
                    "assigned_to": assigned_to,
                    "elapsed": elapsed,
                    "elapsed_hours": elapsed.total_seconds() / 3600,
                }
                if elapsed > SLA_THRESHOLDS["editing_to_review"]:
                    entry["sla_breach"] = "Edit taking 24h+"
                    metrics["overdue"].append(entry)
                else:
                    metrics["on_track"].append(entry)

        elif status == "review":
            metrics["total_review"] += 1
            if last_changed:
                elapsed = now - last_changed
                entry = {
                    "id": vid,
                    "title": title,
                    "status": status,
                    "assigned_to": assigned_to,
                    "elapsed": elapsed,
                    "elapsed_hours": elapsed.total_seconds() / 3600,
                }
                if elapsed > SLA_THRESHOLDS["review_to_approved"]:
                    entry["sla_breach"] = "Review pending 8h+"
                    metrics["overdue"].append(entry)
                else:
                    metrics["on_track"].append(entry)

        # Track VA performance
        if assigned_to and status in ("posted", "approved"):
            if assigned_to not in metrics["va_performance"]:
                metrics["va_performance"][assigned_to] = {
                    "completed": 0,
                    "total_edit_hours": 0,
                }
            metrics["va_performance"][assigned_to]["completed"] += 1

    return metrics


def show_status(metrics: dict):
    """Display current SLA status."""
    print(f"\n{'='*60}")
    print(f"  VA SLA Tracker — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}\n")

    print(f"  Active: {metrics['total_assigned']} assigned, {metrics['total_editing']} editing, {metrics['total_review']} in review")
    print(f"  On track: {len(metrics['on_track'])} | Overdue: {len(metrics['overdue'])}")

    if metrics["overdue"]:
        print(f"\n  ⚠️  OVERDUE ({len(metrics['overdue'])} items):")
        for item in sorted(metrics["overdue"], key=lambda x: x["elapsed_hours"], reverse=True):
            hours = item["elapsed_hours"]
            print(f"    [{item['status'].upper():8s}] {item['title'][:35]:35s} — {hours:.0f}h ({item['sla_breach']})")
            if item.get("assigned_to"):
                print(f"             Assigned to: {item['assigned_to']}")

    if metrics["on_track"]:
        print(f"\n  ✓ ON TRACK ({len(metrics['on_track'])} items):")
        for item in metrics["on_track"]:
            hours = item["elapsed_hours"]
            print(f"    [{item['status'].upper():8s}] {item['title'][:35]:35s} — {hours:.1f}h")

    if metrics["va_performance"]:
        print(f"\n  VA Performance:")
        for va, stats in metrics["va_performance"].items():
            print(f"    {va}: {stats['completed']} completed")

    print()


def generate_weekly_report(metrics: dict):
    """Generate weekly VA performance report."""
    BUSINESS_DIR.mkdir(parents=True, exist_ok=True)

    today = datetime.now().strftime("%Y-%m-%d")
    report_path = BUSINESS_DIR / f"{today}-va-weekly-report.md"

    lines = [
        f"# VA Weekly Performance Report",
        f"**Week of:** {today}",
        f"**Generated:** {datetime.now().strftime('%H:%M')}",
        f"",
        f"## Current Queue",
        f"- Assigned: {metrics['total_assigned']}",
        f"- Editing: {metrics['total_editing']}",
        f"- Review: {metrics['total_review']}",
        f"- Overdue: {len(metrics['overdue'])}",
        f"",
        f"## SLA Compliance",
        f"- On track: {len(metrics['on_track'])}",
        f"- Breached: {len(metrics['overdue'])}",
        f"- Compliance rate: {len(metrics['on_track']) / max(len(metrics['on_track']) + len(metrics['overdue']), 1) * 100:.0f}%",
        f"",
    ]

    if metrics["overdue"]:
        lines.append("## Overdue Items")
        for item in metrics["overdue"]:
            lines.append(f"- **{item['title']}** — {item['elapsed_hours']:.0f}h in {item['status']} ({item['sla_breach']})")
        lines.append("")

    if metrics["va_performance"]:
        lines.append("## VA Performance")
        for va, stats in metrics["va_performance"].items():
            lines.append(f"- **{va}**: {stats['completed']} videos completed")
        lines.append("")

    lines.append("## Recommendations")
    if metrics["overdue"]:
        lines.append("- Review overdue items and reassign if needed")
    if metrics["total_assigned"] == 0 and metrics["total_editing"] == 0:
        lines.append("- VA queue is empty — assign more scripted videos")
    lines.append("")

    report = "\n".join(lines)
    with open(report_path, "w") as f:
        f.write(report)

    log.info(f"Weekly report saved to {report_path}")
    print(report)


def main():
    JOURNALS_DIR.mkdir(parents=True, exist_ok=True)

    if not API_KEY:
        log.error("No FlashFlow API key found")
        sys.exit(1)

    videos = get_pipeline_videos()
    metrics = calculate_sla_metrics(videos)

    if "--alerts" in sys.argv:
        if metrics["overdue"]:
            print(f"\n⚠️ {len(metrics['overdue'])} overdue items:")
            for item in metrics["overdue"]:
                print(f"  {item['title'][:40]} — {item['elapsed_hours']:.0f}h ({item['sla_breach']})")
        else:
            print("✓ All items on track")

    elif "--report" in sys.argv:
        generate_weekly_report(metrics)

    elif "--daemon" in sys.argv:
        log.info("Starting SLA tracker daemon (checking every 30 minutes)...")
        while True:
            try:
                videos = get_pipeline_videos()
                metrics = calculate_sla_metrics(videos)
                if metrics["overdue"]:
                    log.warning(f"{len(metrics['overdue'])} items overdue")
                    for item in metrics["overdue"]:
                        log.warning(f"  {item['title'][:40]} — {item['elapsed_hours']:.0f}h")
                else:
                    log.info("All items on track")
            except Exception as e:
                log.error(f"Check failed: {e}")
            time.sleep(1800)

    else:
        show_status(metrics)


if __name__ == "__main__":
    main()
