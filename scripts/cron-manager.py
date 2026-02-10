#!/usr/bin/env python3
"""
FlashFlow Cron Manager

Centralized scheduler for all FlashFlow automation tasks.
Replaces individual daemon modes with a single coordinated scheduler.
Runs on Mac Mini as the primary orchestration point.

Schedule:
  - TikTok scraper: every 6 hours (dispatched to HP worker)
  - Research scanner: every 4 hours (dispatched to HP worker)
  - Drive watcher: every 30 minutes (local)
  - Winner detection: daily at 10 PM ET
  - Health check: every 5 minutes
  - Pipeline check: 9 AM, 2 PM, 6 PM ET (weekdays)

Usage:
  python cron-manager.py              # Show schedule
  python cron-manager.py run          # Start the scheduler
  python cron-manager.py run-once     # Execute all due tasks once
  python cron-manager.py next         # Show next scheduled tasks
"""

import json
import logging
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

# --- Configuration ---

CONFIG_PATH = Path(__file__).parent / "cron-manager-config.json"
STATE_PATH = Path(__file__).parent / ".cron-manager-state.json"
LOG_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"
SCRIPTS_DIR = Path(__file__).parent

ET = ZoneInfo("America/New_York")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "cron-manager.log", mode="a"),
    ],
)
log = logging.getLogger("cron-manager")


# --- Schedule Definition ---

SCHEDULE = [
    {
        "name": "drive-watcher",
        "script": "drive-watcher.py",
        "interval_minutes": 30,
        "machine": "local",
        "description": "Scan Google Drive for new video uploads",
    },
    {
        "name": "health-check",
        "type": "builtin",
        "handler": "health_check",
        "interval_minutes": 5,
        "machine": "local",
        "description": "Check all systems health",
    },
    {
        "name": "tiktok-scraper",
        "script": "tiktok-scraper.py",
        "interval_minutes": 360,  # 6 hours
        "machine": "remote",
        "description": "Scrape TikTok video stats",
    },
    {
        "name": "research-scanner",
        "script": "research-scanner.py",
        "interval_minutes": 240,  # 4 hours
        "machine": "remote",
        "description": "Scan Reddit for trending products",
    },
    {
        "name": "winner-detection",
        "type": "builtin",
        "handler": "detect_winners",
        "schedule": "daily",
        "time_et": "22:00",
        "machine": "local",
        "description": "Auto-detect winning videos",
    },
    {
        "name": "pipeline-check-morning",
        "type": "builtin",
        "handler": "pipeline_check",
        "schedule": "weekday",
        "time_et": "09:00",
        "machine": "local",
        "description": "Morning pipeline bottleneck check",
    },
    {
        "name": "pipeline-check-afternoon",
        "type": "builtin",
        "handler": "pipeline_check",
        "schedule": "weekday",
        "time_et": "14:00",
        "machine": "local",
        "description": "Afternoon pipeline check",
    },
    {
        "name": "pipeline-check-evening",
        "type": "builtin",
        "handler": "pipeline_check",
        "schedule": "weekday",
        "time_et": "18:00",
        "machine": "local",
        "description": "Evening pipeline summary",
    },
]


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {
        "flashflow_api_url": "https://web-pied-delta-30.vercel.app/api",
        "flashflow_api_key": "",
        "remote_host": "",
        "remote_user": "",
        "remote_ssh_key": "~/.ssh/id_ed25519_new",
        "remote_scripts_dir": "C:\\FlashFlow\\scripts",
        "remote_python": "C:\\FlashFlow\\.venv\\Scripts\\python.exe",
    }


def load_state() -> dict:
    if STATE_PATH.exists():
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"last_run": {}, "run_counts": {}, "errors": {}}


def save_state(state: dict):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2, default=str)


def now_et() -> datetime:
    return datetime.now(ET)


def is_weekday() -> bool:
    return now_et().weekday() < 5


def should_run(task: dict, state: dict) -> bool:
    """Check if a task is due to run."""
    name = task["name"]
    last = state.get("last_run", {}).get(name)

    if task.get("schedule") == "weekday" and not is_weekday():
        return False

    if task.get("schedule") in ("daily", "weekday"):
        # Time-based: check if we've passed the scheduled time today
        target_time = task.get("time_et", "00:00")
        hour, minute = map(int, target_time.split(":"))
        target = now_et().replace(hour=hour, minute=minute, second=0, microsecond=0)

        if now_et() < target:
            return False  # Not yet time

        if last:
            last_dt = datetime.fromisoformat(last)
            if last_dt.astimezone(ET).date() == now_et().date():
                return False  # Already ran today

        return True

    elif task.get("interval_minutes"):
        if not last:
            return True
        last_dt = datetime.fromisoformat(last)
        elapsed = (datetime.now(ET) - last_dt.astimezone(ET)).total_seconds() / 60
        return elapsed >= task["interval_minutes"]

    return False


def run_local_script(script_name: str) -> tuple[bool, str]:
    """Run a Python script locally."""
    script_path = SCRIPTS_DIR / script_name
    if not script_path.exists():
        return False, f"Script not found: {script_path}"

    try:
        result = subprocess.run(
            ["python3", str(script_path)],
            capture_output=True, text=True, timeout=300,
            cwd=str(SCRIPTS_DIR),
        )
        output = result.stdout + result.stderr
        return result.returncode == 0, output[-500:]  # Last 500 chars
    except subprocess.TimeoutExpired:
        return False, "Timed out after 5 minutes"
    except Exception as e:
        return False, str(e)


def run_remote_script(config: dict, script_name: str) -> tuple[bool, str]:
    """Run a Python script on the remote worker via SSH."""
    host = config.get("remote_host", "")
    user = config.get("remote_user", "")
    key = config.get("remote_ssh_key", "")
    remote_dir = config.get("remote_scripts_dir", "")
    python = config.get("remote_python", "python")

    if not host:
        return False, "Remote host not configured"

    import os
    key_path = os.path.expanduser(key)

    ssh_cmd = [
        "ssh", "-i", key_path,
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=no",
        f"{user}@{host}",
        f"cd /d {remote_dir} && {python} {script_name}",
    ]

    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=600)
        output = result.stdout + result.stderr
        return result.returncode == 0, output[-500:]
    except subprocess.TimeoutExpired:
        return False, "SSH command timed out (10m)"
    except Exception as e:
        return False, str(e)


# --- Builtin task handlers ---

def health_check(config: dict) -> tuple[bool, str]:
    """Check FlashFlow API health."""
    api_url = config.get("flashflow_api_url", "").rstrip("/")
    try:
        resp = httpx.get(f"{api_url}/observability/health", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return True, f"API healthy: {json.dumps(data.get('data', {}))[:200]}"
        return False, f"API returned {resp.status_code}"
    except Exception as e:
        return False, f"API unreachable: {e}"


def detect_winners(config: dict) -> tuple[bool, str]:
    """Trigger batch winner detection."""
    api_url = config.get("flashflow_api_url", "").rstrip("/")
    api_key = config.get("flashflow_api_key", "")
    try:
        resp = httpx.post(
            f"{api_url}/videos/detect-winners",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        data = resp.json()
        if data.get("ok"):
            return True, f"Winners detected: {json.dumps(data.get('data', {}))[:200]}"
        return False, f"Winner detection failed: {data}"
    except Exception as e:
        return False, f"Winner detection error: {e}"


def pipeline_check(config: dict) -> tuple[bool, str]:
    """Check pipeline for stuck videos."""
    api_url = config.get("flashflow_api_url", "").rstrip("/")
    api_key = config.get("flashflow_api_key", "")
    results = []

    try:
        # Queue summary
        resp = httpx.get(
            f"{api_url}/observability/queue-summary",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            results.append(f"Queue: {json.dumps(data)[:150]}")

        # Stuck videos
        resp2 = httpx.get(
            f"{api_url}/observability/stuck",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        if resp2.status_code == 200:
            stuck = resp2.json().get("data", [])
            results.append(f"Stuck videos: {len(stuck)}")

        return True, " | ".join(results)
    except Exception as e:
        return False, f"Pipeline check error: {e}"


BUILTIN_HANDLERS = {
    "health_check": health_check,
    "detect_winners": detect_winners,
    "pipeline_check": pipeline_check,
}


def execute_task(task: dict, config: dict) -> tuple[bool, str]:
    """Execute a single task."""
    task_type = task.get("type", "script")

    if task_type == "builtin":
        handler_name = task.get("handler", "")
        handler = BUILTIN_HANDLERS.get(handler_name)
        if not handler:
            return False, f"Unknown handler: {handler_name}"
        return handler(config)
    else:
        script = task.get("script", "")
        machine = task.get("machine", "local")
        if machine == "remote":
            return run_remote_script(config, script)
        else:
            return run_local_script(script)


def cmd_show_schedule():
    """Display the schedule."""
    print("\n=== FlashFlow Cron Schedule ===\n")
    state = load_state()

    for task in SCHEDULE:
        name = task["name"]
        last = state.get("last_run", {}).get(name, "never")
        count = state.get("run_counts", {}).get(name, 0)
        errors = state.get("errors", {}).get(name, 0)

        schedule_str = ""
        if task.get("interval_minutes"):
            schedule_str = f"every {task['interval_minutes']}m"
        elif task.get("time_et"):
            days = "weekdays" if task.get("schedule") == "weekday" else "daily"
            schedule_str = f"{task['time_et']} ET ({days})"

        due = should_run(task, state)
        status = "DUE NOW" if due else "waiting"

        print(f"  {name:30s} {schedule_str:25s} [{status:8s}]  runs={count}  errors={errors}")
        print(f"  {'':30s} last: {last}")
    print()


def cmd_next():
    """Show next tasks due."""
    state = load_state()
    print("\n=== Next Due Tasks ===\n")
    for task in SCHEDULE:
        if should_run(task, state):
            print(f"  DUE: {task['name']} — {task['description']}")
    print()


def cmd_run(config: dict):
    """Main scheduler loop."""
    state = load_state()
    log.info("Starting FlashFlow Cron Manager...")

    while True:
        for task in SCHEDULE:
            if should_run(task, state):
                name = task["name"]
                log.info(f"Running: {name} — {task['description']}")

                success, output = execute_task(task, config)

                state.setdefault("last_run", {})[name] = datetime.now(ET).isoformat()
                state.setdefault("run_counts", {})[name] = state.get("run_counts", {}).get(name, 0) + 1

                if success:
                    log.info(f"  OK: {output[:200]}")
                    state.get("errors", {}).pop(name, None)
                else:
                    log.error(f"  FAIL: {output[:200]}")
                    state.setdefault("errors", {})[name] = state.get("errors", {}).get(name, 0) + 1

                save_state(state)

        # Check every 60 seconds
        time.sleep(60)


def cmd_run_once(config: dict):
    """Execute all due tasks once, then exit."""
    state = load_state()
    executed = 0

    for task in SCHEDULE:
        if should_run(task, state):
            name = task["name"]
            log.info(f"Running: {name}")

            success, output = execute_task(task, config)

            state.setdefault("last_run", {})[name] = datetime.now(ET).isoformat()
            state.setdefault("run_counts", {})[name] = state.get("run_counts", {}).get(name, 0) + 1

            if success:
                log.info(f"  OK: {output[:200]}")
            else:
                log.error(f"  FAIL: {output[:200]}")
                state.setdefault("errors", {})[name] = state.get("errors", {}).get(name, 0) + 1

            executed += 1

    save_state(state)
    log.info(f"Executed {executed} due tasks.")


def main():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config()

    if len(sys.argv) < 2:
        cmd_show_schedule()
    elif sys.argv[1] == "run":
        cmd_run(config)
    elif sys.argv[1] == "run-once":
        cmd_run_once(config)
    elif sys.argv[1] == "next":
        cmd_next()
    elif sys.argv[1] == "schedule":
        cmd_show_schedule()
    else:
        print(f"Unknown command: {sys.argv[1]}")
        print("Usage: cron-manager.py [run|run-once|next|schedule]")
        sys.exit(1)


if __name__ == "__main__":
    main()
