#!/usr/bin/env python3
"""
Delta-Only Health Check: Pipeline status, bottlenecks, alerts

Trigger: Cron job (every morning at 8 AM) or manual run
Output: Telegram alert ONLY when meaningful deltas exist.

Delta detection:
  - Computes a fingerprint of (status_counts, stuck_count, alert_count)
  - Persists last_notified_state to .health-check-state.json (chmod 600)
  - If fingerprint matches last notified state → silent (no Telegram)
  - If fingerprint differs → sends concise delta summary

Feature flag: REMINDERS_ENABLED (default: false)
  Set REMINDERS_ENABLED=true to enable Telegram sends.

Channel routing: TELEGRAM_LOG_CHAT_ID
  If set, messages go to this channel instead of TELEGRAM_CHAT_ID.

Flags:
  --force    Always send, even if no delta (for manual checks)
  --dry-run  Compute deltas, print to stdout, don't send Telegram
"""

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

# ── Configuration ────────────────────────────────────────────────────────────

FLASHFLOW_KEY = os.getenv("SERVICE_API_KEY") or os.getenv("FLASHFLOW_API_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
# Route to log channel if configured, otherwise fall back to main chat
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_LOG_CHAT_ID") or os.getenv("BRANDON_CHAT_ID", "8287880388")

FLASHFLOW_API = "https://web-pied-delta-30.vercel.app/api"
TELEGRAM_API = "https://api.telegram.org/bot"

STATE_PATH = Path(__file__).parent / ".health-check-state.json"

MAX_LINES = 5

# ── Feature flag ─────────────────────────────────────────────────────────────

def reminders_enabled() -> bool:
    """REMINDERS_ENABLED defaults to false — must be explicitly set to 'true' or '1'."""
    flag = os.getenv("REMINDERS_ENABLED", "false").lower()
    return flag in ("true", "1")


# ── Output sanitizer ────────────────────────────────────────────────────────

CODE_LEAK_PATTERNS = [
    r"```",
    r"\x1b\[",
    r"\\x1b\[",
    r"\u001b",
    r"\\u001b",
    r"\bimport\s",
    r"\bdef\s+\w+\s*\(",
    r"\bawait\s",
    r"\btool\b",
    r"\bfunction\b",
    r'\{\s*"[^"]+"\s*:',
    r"^\s*\}\s*$",
]

def sanitize_message(raw: str) -> str | None:
    """Return cleaned message or None if it should be dropped."""
    if not raw or not raw.strip():
        return None

    for pattern in CODE_LEAK_PATTERNS:
        if re.search(pattern, raw, re.MULTILINE | re.IGNORECASE):
            log_message(f"Sanitizer: blocked (matched {pattern})")
            return None

    # Strip non-printable chars (keep newlines + tabs)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", raw)

    # Enforce max lines
    lines = cleaned.split("\n")
    if len(lines) > MAX_LINES:
        cleaned = "\n".join(lines[:MAX_LINES]) + "\n…"

    return cleaned if cleaned.strip() else None


# ── Structured Logging ───────────────────────────────────────────────────────

def log_structured(**fields):
    """Print structured JSON log line."""
    fields["ts"] = datetime.now(tz=timezone.utc).isoformat()
    print(json.dumps(fields, default=str))


def log_message(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")


# ── State Persistence ────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_PATH.exists():
        try:
            with open(STATE_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def save_state(state: dict):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2, default=str)
    os.chmod(STATE_PATH, 0o600)


def compute_fingerprint(analysis: dict) -> str:
    """Deterministic hash of the meaningful parts of the analysis."""
    sig = {
        "by_status": dict(sorted(analysis.get("by_status", {}).items())),
        "stuck_count": len(analysis.get("stuck_videos", [])),
        "alert_count": len(analysis.get("alerts", [])),
        "stuck_ids": sorted(v.get("id", "") for v in analysis.get("stuck_videos", [])),
    }
    return hashlib.sha256(json.dumps(sig, sort_keys=True).encode()).hexdigest()[:16]


# ── API ──────────────────────────────────────────────────────────────────────

def get_all_videos():
    log_message("Fetching all videos...")
    resp = requests.get(
        f"{FLASHFLOW_API}/videos",
        headers={"Authorization": f"Bearer {FLASHFLOW_KEY}"}
    )
    resp.raise_for_status()
    data = resp.json().get("data", resp.json())
    videos = data if isinstance(data, list) else [data]
    return videos


# ── Analysis ─────────────────────────────────────────────────────────────────

def analyze_pipeline(videos):
    log_message("Analyzing pipeline...")

    analysis = {
        "total_videos": len(videos),
        "by_status": {},
        "stuck_videos": [],
        "old_videos": [],
        "alerts": []
    }

    status_counts = {}
    for video in videos:
        status = video.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
    analysis["by_status"] = status_counts

    now = datetime.now(tz=timezone.utc)
    for video in videos:
        created_at_str = video.get("created_at")
        if not created_at_str:
            continue

        try:
            created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            age_hours = (now - created_at).total_seconds() / 3600

            status = video.get("status")

            if status not in ["posted", "error"] and age_hours > 24:
                analysis["stuck_videos"].append({
                    "id": video.get("id"),
                    "title": video.get("title"),
                    "status": status,
                    "age_hours": age_hours
                })

            if status not in ["posted", "error"] and age_hours > 168:
                analysis["old_videos"].append({
                    "id": video.get("id"),
                    "title": video.get("title"),
                    "age_days": age_hours / 24
                })
        except Exception:
            pass

    if analysis["stuck_videos"]:
        count = len(analysis["stuck_videos"])
        analysis["alerts"].append(f"{count} video(s) stuck >24h")

    if analysis["old_videos"]:
        count = len(analysis["old_videos"])
        analysis["alerts"].append(f"{count} video(s) >7 days old")

    needs_script = analysis["by_status"].get("needs_script", 0)
    if needs_script > 5:
        analysis["alerts"].append(f"{needs_script} videos waiting for scripts")

    not_recorded = analysis["by_status"].get("not_recorded", 0)
    if not_recorded > 3:
        analysis["alerts"].append(f"{not_recorded} videos waiting for recording")

    posted_videos = [v for v in videos if v.get("status") == "posted"]
    if len(posted_videos) == 0 and analysis["total_videos"] < 3:
        analysis["alerts"].append("Content dry spell risk")

    return analysis


# ── Delta Computation ────────────────────────────────────────────────────────

def compute_deltas(analysis: dict, prev_state: dict) -> dict:
    """Compare current analysis to last notified state. Return deltas."""
    deltas = {
        "new_stuck": [],
        "resolved_stuck": [],
        "status_changes": {},
        "new_alerts": [],
        "resolved_alerts": [],
    }

    prev_stuck_ids = set(prev_state.get("stuck_ids", []))
    curr_stuck_ids = set(v.get("id", "") for v in analysis.get("stuck_videos", []))

    deltas["new_stuck"] = [
        v for v in analysis.get("stuck_videos", [])
        if v.get("id") not in prev_stuck_ids
    ]
    deltas["resolved_stuck"] = list(prev_stuck_ids - curr_stuck_ids)

    prev_status = prev_state.get("by_status", {})
    curr_status = analysis.get("by_status", {})
    all_keys = set(prev_status.keys()) | set(curr_status.keys())
    for k in all_keys:
        prev_count = prev_status.get(k, 0)
        curr_count = curr_status.get(k, 0)
        if prev_count != curr_count:
            deltas["status_changes"][k] = {"was": prev_count, "now": curr_count}

    prev_alerts = set(prev_state.get("alerts", []))
    curr_alerts = set(analysis.get("alerts", []))
    deltas["new_alerts"] = list(curr_alerts - prev_alerts)
    deltas["resolved_alerts"] = list(prev_alerts - curr_alerts)

    return deltas


def has_meaningful_deltas(deltas: dict) -> bool:
    return bool(
        deltas.get("new_stuck")
        or deltas.get("resolved_stuck")
        or deltas.get("status_changes")
        or deltas.get("new_alerts")
        or deltas.get("resolved_alerts")
    )


# ── Message Building ─────────────────────────────────────────────────────────

def build_delta_message(analysis: dict, deltas: dict) -> str:
    """Build a concise, human-readable delta summary. No code fences, no headings."""
    lines = []
    lines.append(f"Pipeline update ({analysis['total_videos']} videos)")

    if deltas["status_changes"]:
        for status, change in deltas["status_changes"].items():
            label = status.replace("_", " ").title()
            diff = change["now"] - change["was"]
            arrow = "+" if diff > 0 else ""
            lines.append(f"  {label}: {change['was']} -> {change['now']} ({arrow}{diff})")

    if deltas["new_stuck"]:
        lines.append(f"Newly stuck: {len(deltas['new_stuck'])}")

    if deltas["resolved_stuck"]:
        lines.append(f"Resolved: {len(deltas['resolved_stuck'])} unstuck")

    if deltas["new_alerts"]:
        for a in deltas["new_alerts"]:
            lines.append(f"  Alert: {a}")

    return "\n".join(lines)


def send_telegram(message: str):
    if not reminders_enabled():
        log_message(f"Telegram skipped (REMINDERS_ENABLED={os.getenv('REMINDERS_ENABLED', 'false')})")
        return

    safe = sanitize_message(message)
    if not safe:
        log_message("Telegram skipped (sanitizer blocked)")
        return

    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        log_message("Telegram not configured, skipping send")
        return
    url = f"{TELEGRAM_API}{TELEGRAM_BOT_TOKEN}/sendMessage"
    resp = requests.post(
        url,
        json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": safe,
            "parse_mode": "Markdown"
        }
    )
    resp.raise_for_status()
    log_message("Telegram message sent")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    force = "--force" in sys.argv
    dry_run = "--dry-run" in sys.argv

    try:
        videos = get_all_videos()
        analysis = analyze_pipeline(videos)

        fingerprint = compute_fingerprint(analysis)
        prev_state = load_state()
        prev_fingerprint = prev_state.get("fingerprint", "")

        deltas = compute_deltas(analysis, prev_state)
        has_deltas = has_meaningful_deltas(deltas)

        # Structured log — always emitted
        log_structured(
            event="health_check",
            checked_at=datetime.now(tz=timezone.utc).isoformat(),
            fingerprint=fingerprint,
            prev_fingerprint=prev_fingerprint,
            delta_counts={
                "new_stuck": len(deltas.get("new_stuck", [])),
                "resolved_stuck": len(deltas.get("resolved_stuck", [])),
                "status_changes": len(deltas.get("status_changes", {})),
                "new_alerts": len(deltas.get("new_alerts", [])),
                "resolved_alerts": len(deltas.get("resolved_alerts", [])),
            },
            has_deltas=has_deltas,
            notified=False,  # will be updated below
            force=force,
            dry_run=dry_run,
        )

        # No deltas and not forced → send nothing
        if not has_deltas and not force:
            log_message("No deltas — skipping Telegram notification")
        elif has_deltas or force:
            message = build_delta_message(analysis, deltas)

            if dry_run:
                print("--- DRY RUN (would send) ---")
                print(message)
                print("---")
            else:
                send_telegram(message)
                log_structured(event="notified", notified=True, message_length=len(message))

            # Persist current state
            new_state = {
                "fingerprint": fingerprint,
                "by_status": analysis["by_status"],
                "stuck_ids": [v.get("id", "") for v in analysis.get("stuck_videos", [])],
                "alerts": analysis.get("alerts", []),
                "last_notified_at": datetime.now(tz=timezone.utc).isoformat(),
                "total_videos": analysis["total_videos"],
            }
            save_state(new_state)

        # Always output analysis for log collection
        print(json.dumps({
            "status": "success",
            "has_deltas": has_deltas,
            "analysis": analysis,
        }, default=str))

    except Exception as e:
        log_message(f"Error: {str(e)}")
        log_structured(event="health_check_error", error=str(e))
        # Error alerts also gated by REMINDERS_ENABLED
        try:
            send_telegram(f"Health check failed: {str(e)}")
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
