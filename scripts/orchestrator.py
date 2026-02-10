#!/usr/bin/env python3
"""
FlashFlow Multi-Machine Orchestrator

Coordinates work distribution between Mac Mini (primary) and
HP Worker laptop (secondary). Manages task queues, health checks,
result collection, and failover.

Architecture:
  Mac Mini (192.168.1.210) — primary
    - Runs OpenClaw gateway, FlashFlow web app
    - Handles AI generation, API requests
    - Coordinates all workers

  HP Laptop (worker) — secondary
    - Runs TikTok scraping (Playwright)
    - Runs research scanning
    - Handles video processing tasks

Communication: SSH (key-based auth, no passwords)
State: JSON file on Mac Mini

Usage:
  python orchestrator.py status            # Show all machine statuses
  python orchestrator.py dispatch          # Dispatch pending tasks
  python orchestrator.py health            # Run health checks
  python orchestrator.py --daemon          # Run continuously (5 min interval)
"""

import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import httpx

# --- Configuration ---

CONFIG_PATH = Path(__file__).parent / "orchestrator-config.json"
STATE_PATH = Path(__file__).parent / ".orchestrator-state.json"
LOG_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "orchestrator.log", mode="a"),
    ],
)
log = logging.getLogger("orchestrator")

DEFAULT_CONFIG = {
    "machines": {
        "mac-mini": {
            "host": "localhost",
            "role": "primary",
            "ssh_user": None,
            "capabilities": ["api", "ai-generation", "orchestration", "cron"],
            "scripts_dir": str(Path(__file__).parent),
        },
        "hp-worker": {
            "host": "HP_WORKER_IP",
            "role": "worker",
            "ssh_user": "Brandon",
            "ssh_key": "~/.ssh/id_ed25519_new",
            "capabilities": ["scraping", "research", "video-processing"],
            "scripts_dir": "C:\\FlashFlow\\scripts",
        },
    },
    "flashflow_api_url": "https://web-pied-delta-30.vercel.app/api",
    "flashflow_api_key": "",
    "health_check_interval_minutes": 5,
    "task_dispatch_interval_minutes": 15,
}

# --- Task types and their machine requirements ---

TASK_TYPES = {
    "tiktok-scrape": {
        "script": "tiktok-scraper.py",
        "requires": ["scraping"],
        "priority": 2,
        "timeout_minutes": 30,
    },
    "research-scan": {
        "script": "research-scanner.py",
        "requires": ["research"],
        "priority": 3,
        "timeout_minutes": 20,
    },
    "drive-watch": {
        "script": "drive-watcher.py",
        "requires": ["api"],
        "priority": 3,
        "timeout_minutes": 10,
    },
    "discord-monitor": {
        "script": "discord-monitor.py",
        "requires": ["api"],
        "priority": 4,
        "timeout_minutes": 15,
    },
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return DEFAULT_CONFIG


def load_state() -> dict:
    if STATE_PATH.exists():
        with open(STATE_PATH) as f:
            return json.load(f)
    return {
        "machines": {},
        "running_tasks": [],
        "completed_tasks": [],
        "failed_tasks": [],
        "last_dispatch": None,
    }


def save_state(state: dict):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2, default=str)


def run_ssh_command(machine: dict, command: str, timeout: int = 30) -> tuple[bool, str]:
    """Execute a command on a remote machine via SSH."""
    host = machine["host"]
    user = machine.get("ssh_user", "")
    key = machine.get("ssh_key", "")

    if host == "localhost":
        try:
            result = subprocess.run(
                command, shell=True, capture_output=True, text=True, timeout=timeout
            )
            return result.returncode == 0, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return False, "Command timed out"
        except Exception as e:
            return False, str(e)

    ssh_cmd = ["ssh"]
    if key:
        key_path = os.path.expanduser(key)
        ssh_cmd.extend(["-i", key_path])
    ssh_cmd.extend(["-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=no"])

    target = f"{user}@{host}" if user else host
    ssh_cmd.append(target)
    ssh_cmd.append(command)

    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=timeout)
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "SSH command timed out"
    except Exception as e:
        return False, str(e)


def check_machine_health(name: str, machine: dict) -> dict:
    """Check health of a single machine."""
    health = {
        "name": name,
        "host": machine["host"],
        "role": machine["role"],
        "status": "unknown",
        "checked_at": datetime.utcnow().isoformat(),
        "details": {},
    }

    # Ping check
    if machine["host"] == "localhost":
        health["status"] = "online"
        health["details"]["reachable"] = True
    else:
        success, output = run_ssh_command(machine, "echo ok", timeout=10)
        health["details"]["reachable"] = success
        if not success:
            health["status"] = "offline"
            health["details"]["error"] = output.strip()
            return health
        health["status"] = "online"

    # CPU/memory check
    if machine["host"] == "localhost" or machine["role"] != "primary":
        if machine["host"] == "localhost":
            cmd = "python3 -c \"import psutil; print(psutil.cpu_percent(), psutil.virtual_memory().percent)\" 2>/dev/null || echo 'N/A N/A'"
        else:
            cmd = "python -c \"import psutil; print(psutil.cpu_percent(), psutil.virtual_memory().percent)\" 2>NUL || echo N/A N/A"
        success, output = run_ssh_command(machine, cmd)
        if success:
            parts = output.strip().split()
            if len(parts) >= 2 and parts[0] != "N/A":
                try:
                    health["details"]["cpu_percent"] = float(parts[0])
                    health["details"]["memory_percent"] = float(parts[1])
                except ValueError:
                    pass

    # Disk check
    if machine["host"] == "localhost":
        success, output = run_ssh_command(machine, "df -h / | tail -1 | awk '{print $5}'")
    else:
        success, output = run_ssh_command(machine, "wmic logicaldisk get freespace,size /format:csv 2>NUL || echo N/A")

    if success:
        health["details"]["disk_info"] = output.strip()

    # Check if scheduled tasks are running
    scripts_dir = machine.get("scripts_dir", "")
    if machine["host"] != "localhost" and scripts_dir:
        success, output = run_ssh_command(
            machine,
            'schtasks /query /tn "FlashFlow-TikTokScraper" /fo CSV /nh 2>NUL || echo not_found'
        )
        health["details"]["scheduled_tasks"] = "configured" if "Ready" in output or "Running" in output else "not_configured"

    return health


def dispatch_task(config: dict, state: dict, task_type: str, target_machine: str | None = None) -> bool:
    """Dispatch a task to the appropriate machine."""
    if task_type not in TASK_TYPES:
        log.error(f"Unknown task type: {task_type}")
        return False

    task_def = TASK_TYPES[task_type]
    machines = config.get("machines", {})

    # Find a suitable machine
    target = None
    if target_machine and target_machine in machines:
        target = target_machine
    else:
        # Auto-select based on capabilities
        for name, machine in machines.items():
            caps = set(machine.get("capabilities", []))
            required = set(task_def["requires"])
            if required.issubset(caps):
                # Check if machine is online
                machine_state = state.get("machines", {}).get(name, {})
                if machine_state.get("status") != "offline":
                    target = name
                    break

    if not target:
        log.warning(f"No suitable machine found for task '{task_type}'")
        return False

    machine = machines[target]
    scripts_dir = machine.get("scripts_dir", "")
    script = task_def["script"]

    # Build command
    if machine["host"] == "localhost":
        python_cmd = "python3"
        cmd = f"cd {scripts_dir} && {python_cmd} {script}"
    else:
        python_cmd = "C:\\FlashFlow\\.venv\\Scripts\\python.exe"
        cmd = f"cd /d {scripts_dir} && {python_cmd} {script}"

    log.info(f"Dispatching '{task_type}' to {target} ({machine['host']})")

    task_record = {
        "type": task_type,
        "machine": target,
        "started_at": datetime.utcnow().isoformat(),
        "timeout_minutes": task_def["timeout_minutes"],
        "status": "running",
    }

    # Run async (don't wait for completion)
    if machine["host"] == "localhost":
        try:
            subprocess.Popen(
                cmd, shell=True,
                stdout=open(LOG_DIR / f"{task_type}-latest.log", "w"),
                stderr=subprocess.STDOUT,
            )
            task_record["status"] = "dispatched"
        except Exception as e:
            log.error(f"Failed to dispatch locally: {e}")
            task_record["status"] = "failed"
            task_record["error"] = str(e)
    else:
        # Use nohup + background for remote
        remote_cmd = f"nohup {cmd} > C:\\FlashFlow\\logs\\{task_type}-latest.log 2>&1 &"
        success, output = run_ssh_command(machine, remote_cmd, timeout=15)
        if success:
            task_record["status"] = "dispatched"
        else:
            log.error(f"Failed to dispatch to {target}: {output}")
            task_record["status"] = "failed"
            task_record["error"] = output

    state.setdefault("running_tasks", []).append(task_record)
    return task_record["status"] == "dispatched"


def check_running_tasks(state: dict, config: dict):
    """Check on running tasks and mark completed/failed."""
    running = state.get("running_tasks", [])
    still_running = []

    for task in running:
        started = datetime.fromisoformat(task["started_at"])
        timeout = timedelta(minutes=task.get("timeout_minutes", 30))

        if datetime.utcnow() - started > timeout:
            task["status"] = "timeout"
            task["ended_at"] = datetime.utcnow().isoformat()
            state.setdefault("failed_tasks", []).append(task)
            log.warning(f"Task '{task['type']}' on {task['machine']} timed out")
        else:
            still_running.append(task)

    state["running_tasks"] = still_running


def cmd_status(config: dict, state: dict):
    """Show status of all machines and tasks."""
    machines = config.get("machines", {})
    print("\n=== FlashFlow Orchestrator Status ===\n")

    # Machine status
    print("MACHINES:")
    for name, machine in machines.items():
        health = check_machine_health(name, machine)
        state.setdefault("machines", {})[name] = health
        status_color = "online" if health["status"] == "online" else "OFFLINE"
        print(f"  {name:15s} {machine['host']:20s} [{status_color:8s}] role={machine['role']}")
        if health["details"].get("cpu_percent") is not None:
            print(f"                   CPU: {health['details']['cpu_percent']}%  MEM: {health['details']['memory_percent']}%")

    # Running tasks
    running = state.get("running_tasks", [])
    print(f"\nRUNNING TASKS: {len(running)}")
    for task in running:
        elapsed = datetime.utcnow() - datetime.fromisoformat(task["started_at"])
        print(f"  {task['type']:20s} on {task['machine']:15s} ({elapsed.seconds // 60}m elapsed)")

    # Recent completed
    completed = state.get("completed_tasks", [])[-5:]
    print(f"\nRECENT COMPLETED: {len(completed)}")
    for task in completed:
        print(f"  {task['type']:20s} on {task['machine']:15s} at {task.get('ended_at', 'unknown')}")

    # Recent failed
    failed = state.get("failed_tasks", [])[-5:]
    if failed:
        print(f"\nRECENT FAILURES: {len(failed)}")
        for task in failed:
            print(f"  {task['type']:20s} on {task['machine']:15s} — {task.get('error', task.get('status', 'unknown'))}")

    save_state(state)


def cmd_dispatch(config: dict, state: dict):
    """Dispatch all pending periodic tasks."""
    check_running_tasks(state, config)

    # Check which tasks need to run based on schedule
    now = datetime.utcnow()
    last = state.get("last_dispatch")
    if last:
        last = datetime.fromisoformat(last)
    else:
        last = now - timedelta(hours=24)

    dispatched = 0
    for task_type in TASK_TYPES:
        # Check if already running
        running = [t for t in state.get("running_tasks", []) if t["type"] == task_type]
        if running:
            log.info(f"Task '{task_type}' already running, skipping")
            continue

        if dispatch_task(config, state, task_type):
            dispatched += 1

    state["last_dispatch"] = now.isoformat()
    save_state(state)
    log.info(f"Dispatch complete. {dispatched} tasks dispatched.")


def cmd_health(config: dict, state: dict):
    """Run health checks on all machines."""
    machines = config.get("machines", {})
    all_healthy = True

    for name, machine in machines.items():
        health = check_machine_health(name, machine)
        state.setdefault("machines", {})[name] = health

        if health["status"] != "online":
            all_healthy = False
            log.warning(f"Machine '{name}' is {health['status']}")

    # Check FlashFlow API
    api_url = config.get("flashflow_api_url", "").rstrip("/")
    try:
        resp = httpx.get(f"{api_url}/observability/health", timeout=10)
        if resp.status_code == 200:
            log.info("FlashFlow API: healthy")
        else:
            log.warning(f"FlashFlow API returned {resp.status_code}")
            all_healthy = False
    except Exception as e:
        log.error(f"FlashFlow API unreachable: {e}")
        all_healthy = False

    save_state(state)
    return all_healthy


def main():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config()
    state = load_state()

    if len(sys.argv) < 2 or "--daemon" in sys.argv:
        if "--daemon" in sys.argv:
            interval = config.get("health_check_interval_minutes", 5) * 60
            log.info(f"Starting orchestrator daemon. Checking every {interval // 60} minutes.")
            while True:
                try:
                    cmd_health(config, state)
                    cmd_dispatch(config, state)
                except Exception as e:
                    log.error(f"Orchestrator cycle failed: {e}")
                time.sleep(interval)
        else:
            cmd_status(config, state)
    elif sys.argv[1] == "status":
        cmd_status(config, state)
    elif sys.argv[1] == "dispatch":
        cmd_dispatch(config, state)
    elif sys.argv[1] == "health":
        cmd_health(config, state)
    else:
        print(f"Unknown command: {sys.argv[1]}")
        print("Usage: orchestrator.py [status|dispatch|health|--daemon]")
        sys.exit(1)


if __name__ == "__main__":
    main()
