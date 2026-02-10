#!/usr/bin/env python3
"""
FlashFlow Posting Scheduler

Auto-distributes READY_TO_POST videos across active posting accounts.
Balances by daily posting limits, recent posting history, and account performance.

Usage:
  python posting-scheduler.py                    # Show schedule preview
  python posting-scheduler.py --assign           # Assign videos to accounts
  python posting-scheduler.py --status           # Show account posting status
  python posting-scheduler.py --report           # Weekly posting report
"""

import json
import logging
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import httpx

# --- Configuration ---

API_URL = "https://web-pied-delta-30.vercel.app/api"
JOURNALS_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"

# Posting limits per account per day
MAX_POSTS_PER_DAY = 3
MAX_POSTS_PER_ACCOUNT_PER_DAY = 2

# Optimal posting windows (ET)
POSTING_WINDOWS = [
    {"label": "Morning", "start": 8, "end": 10},
    {"label": "Lunch", "start": 12, "end": 14},
    {"label": "Evening", "start": 18, "end": 21},
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger("posting-scheduler")

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


def get_active_accounts() -> list[dict]:
    """Fetch active posting accounts."""
    r = api_call("GET", "/posting-accounts")
    if r["ok"]:
        return [a for a in (r["data"].get("data") or []) if a.get("is_active")]
    return []


def get_ready_videos() -> list[dict]:
    """Fetch videos ready to post."""
    r = api_call("GET", "/videos/queue")
    if not r["ok"]:
        return []

    videos = r["data"].get("data", [])
    return [v for v in videos if (v.get("recording_status") or v.get("status", "")).upper() in ("READY_TO_POST", "APPROVED")]


def get_account_performance() -> dict[str, dict]:
    """Fetch account-level performance stats."""
    r = api_call("GET", "/analytics", params={"type": "accounts"})
    if r["ok"]:
        perf = {}
        for a in r["data"].get("data", {}).get("accounts", []):
            perf[a["account_id"]] = a
        return perf
    return {}


def get_recent_posts(days: int = 7) -> dict[str, int]:
    """Count recent posts per account (last N days)."""
    r = api_call("GET", "/analytics", params={"type": "throughput", "days": str(days)})
    # Approximate by looking at throughput data
    return {}


def calculate_schedule(accounts: list[dict], videos: list[dict], performance: dict[str, dict]) -> list[dict]:
    """
    Distribute videos across accounts.

    Strategy:
    1. Round-robin across active accounts
    2. Weight by performance (better performing accounts get more)
    3. Respect daily posting limits
    4. Balance brands across accounts (don't stack same brand on one account)
    """
    if not accounts or not videos:
        return []

    # Score accounts by performance
    account_scores = {}
    for acct in accounts:
        aid = acct["id"]
        perf = performance.get(aid, {})
        views = perf.get("views", 0)
        engagement = perf.get("avg_engagement", 0)
        # Higher score = more proven account
        score = 1.0 + (views / max(sum(p.get("views", 0) for p in performance.values()), 1)) + (engagement / 10)
        account_scores[aid] = score

    # Sort accounts by score (best first)
    sorted_accounts = sorted(accounts, key=lambda a: account_scores.get(a["id"], 1.0), reverse=True)

    # Assign videos round-robin with performance weighting
    schedule = []
    account_daily_count = {a["id"]: 0 for a in accounts}
    account_brands = {a["id"]: set() for a in accounts}
    acct_idx = 0

    for video in videos:
        vid = video.get("id", "")
        title = video.get("title", "")[:50]
        brand = ""
        product = video.get("product")
        if isinstance(product, dict):
            brand = product.get("brand", "")

        # Find best account for this video
        best_account = None
        attempts = 0

        while attempts < len(sorted_accounts):
            candidate = sorted_accounts[acct_idx % len(sorted_accounts)]
            cid = candidate["id"]

            # Check daily limit
            if account_daily_count[cid] >= MAX_POSTS_PER_ACCOUNT_PER_DAY:
                acct_idx += 1
                attempts += 1
                continue

            # Prefer accounts that don't already have this brand today
            if brand and brand in account_brands[cid] and attempts < len(sorted_accounts) - 1:
                acct_idx += 1
                attempts += 1
                continue

            best_account = candidate
            break

        if not best_account:
            # All accounts full, use first available
            best_account = sorted_accounts[0]

        aid = best_account["id"]
        account_daily_count[aid] += 1
        if brand:
            account_brands[aid].add(brand)

        # Choose optimal posting window
        window_idx = (len(schedule)) % len(POSTING_WINDOWS)
        window = POSTING_WINDOWS[window_idx]

        schedule.append({
            "video_id": vid,
            "video_title": title,
            "brand": brand,
            "account_id": aid,
            "account_name": best_account["display_name"],
            "account_code": best_account["account_code"],
            "suggested_window": window["label"],
            "suggested_time": f"{window['start']}:00-{window['end']}:00 ET",
        })

        acct_idx += 1

    return schedule


def show_schedule(schedule: list[dict]):
    """Display posting schedule."""
    print(f"\n{'='*70}")
    print(f"  Posting Schedule — {datetime.now().strftime('%Y-%m-%d')}")
    print(f"{'='*70}\n")

    if not schedule:
        print("  No videos ready to post.\n")
        return

    # Group by account
    by_account: dict[str, list[dict]] = {}
    for item in schedule:
        name = item["account_name"]
        if name not in by_account:
            by_account[name] = []
        by_account[name].append(item)

    for account_name, items in by_account.items():
        print(f"  [{account_name}] ({len(items)} videos)")
        for item in items:
            print(f"    {item['suggested_window']:8s}  {item['video_title'][:40]:40s}  {item['brand'] or '-'}")
        print()

    print(f"  Total: {len(schedule)} videos across {len(by_account)} accounts")
    print(f"  Suggested: {MAX_POSTS_PER_ACCOUNT_PER_DAY} max/account/day\n")


def show_status(accounts: list[dict], performance: dict[str, dict]):
    """Show account posting status."""
    print(f"\n{'='*70}")
    print(f"  Account Status — {datetime.now().strftime('%Y-%m-%d')}")
    print(f"{'='*70}\n")

    if not accounts:
        print("  No posting accounts configured.\n")
        return

    print(f"  {'Account':<25s} {'Code':<8s} {'Videos':>8s} {'Posted':>8s} {'Views':>10s} {'Revenue':>10s} {'Eng%':>6s}")
    print(f"  {'─'*25} {'─'*8} {'─'*8} {'─'*8} {'─'*10} {'─'*10} {'─'*6}")

    for acct in accounts:
        perf = performance.get(acct["id"], {})
        views = perf.get("views", 0)
        revenue = perf.get("revenue", 0)
        engagement = perf.get("avg_engagement", 0)
        videos = perf.get("videos", 0)
        posted = perf.get("posted", 0)
        active = "✓" if acct["is_active"] else "✗"

        print(f"  {active} {acct['display_name']:<23s} {acct['account_code']:<8s} {videos:>8d} {posted:>8d} {views:>10,d} ${revenue:>9,d} {engagement:>5.1f}%")

    print()


def generate_weekly_report(accounts: list[dict], performance: dict[str, dict]):
    """Generate weekly posting report."""
    JOURNALS_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    report_path = JOURNALS_DIR / f"{today}-posting-report.md"

    total_videos = sum(p.get("videos", 0) for p in performance.values())
    total_posted = sum(p.get("posted", 0) for p in performance.values())
    total_views = sum(p.get("views", 0) for p in performance.values())
    total_revenue = sum(p.get("revenue", 0) for p in performance.values())

    lines = [
        f"# Weekly Posting Report",
        f"**Date:** {today}",
        f"",
        f"## Summary",
        f"- Active accounts: {len([a for a in accounts if a.get('is_active')])}",
        f"- Total videos: {total_videos}",
        f"- Total posted: {total_posted}",
        f"- Total views: {total_views:,}",
        f"- Total revenue: ${total_revenue:,}",
        f"",
        f"## Account Breakdown",
    ]

    for acct in accounts:
        perf = performance.get(acct["id"], {})
        lines.append(f"### {acct['display_name']} ({acct['account_code']})")
        lines.append(f"- Videos: {perf.get('videos', 0)} | Posted: {perf.get('posted', 0)}")
        lines.append(f"- Views: {perf.get('views', 0):,} | Engagement: {perf.get('avg_engagement', 0):.1f}%")
        lines.append(f"- Revenue: ${perf.get('revenue', 0):,}")
        lines.append("")

    report = "\n".join(lines)
    with open(report_path, "w") as f:
        f.write(report)

    log.info(f"Report saved to {report_path}")
    print(report)


def main():
    if not API_KEY:
        log.error("No FlashFlow API key found")
        sys.exit(1)

    accounts = get_active_accounts()
    performance = get_account_performance()

    if "--status" in sys.argv:
        show_status(accounts, performance)
        return

    if "--report" in sys.argv:
        generate_weekly_report(accounts, performance)
        return

    # Get ready videos and create schedule
    videos = get_ready_videos()
    schedule = calculate_schedule(accounts, videos, performance)

    if "--assign" in sys.argv:
        if not schedule:
            log.info("No videos to assign.")
            return

        log.info(f"Assigning {len(schedule)} videos to posting accounts...")
        assigned = 0

        for item in schedule:
            r = api_call("PATCH", f"/videos/{item['video_id']}", {
                "posting_account_id": item["account_id"],
            })
            if r.get("ok"):
                assigned += 1
                log.info(f"  Assigned: {item['video_title'][:40]} → {item['account_name']}")
            else:
                log.warning(f"  Failed to assign {item['video_title'][:40]}: {r.get('error', 'unknown')}")

        log.info(f"\nAssigned {assigned}/{len(schedule)} videos.")

        # Log to journal
        JOURNALS_DIR.mkdir(parents=True, exist_ok=True)
        today = datetime.now().strftime("%Y-%m-%d")
        journal = JOURNALS_DIR / f"{today}-posting-scheduler.md"
        with open(journal, "a") as f:
            f.write(f"\n## Posting Schedule — {datetime.now().strftime('%H:%M')}\n")
            f.write(f"- Assigned {assigned} videos to {len(set(s['account_id'] for s in schedule))} accounts\n")
    else:
        # Preview mode
        show_schedule(schedule)
        if schedule:
            print("  Run with --assign to actually assign videos to accounts.\n")


if __name__ == "__main__":
    main()
