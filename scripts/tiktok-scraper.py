#!/usr/bin/env python3
"""
TikTok Stats Scraper for FlashFlow

Scrapes view/like/comment/share counts from posted TikTok videos
and pushes stats to FlashFlow via the /api/videos/{id}/stats endpoint.
Then triggers winner detection.

Flow:
  1. GET /api/videos/lookup?account_id=<id> → list of posted videos with tiktok_url
  2. For each video, scrape TikTok page for stats
  3. POST /api/videos/{id}/stats with scraped data
  4. POST /api/videos/detect-winners to evaluate all

Uses Playwright for browser automation since TikTok requires JS rendering.

Usage:
  python tiktok-scraper.py                    # Scrape all accounts
  python tiktok-scraper.py --account ACC_ID   # Scrape specific account
  python tiktok-scraper.py --daemon           # Run every 6 hours
"""

import asyncio
import json
import logging
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)

# --- Configuration ---

CONFIG_PATH = Path(__file__).parent / "tiktok-scraper-config.json"
STATE_PATH = Path(__file__).parent / ".tiktok-scraper-state.json"
LOG_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "tiktok-scraper.log", mode="a"),
    ],
)
log = logging.getLogger("tiktok-scraper")


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log.error(f"Config not found at {CONFIG_PATH}. Copy tiktok-scraper-config.example.json and fill in values.")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return json.load(f)


def load_state() -> dict:
    if STATE_PATH.exists():
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"last_scrape": {}, "error_counts": {}}


def save_state(state: dict):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def parse_count(text: str) -> int:
    """Parse TikTok's abbreviated counts (e.g., '1.2M', '45.3K', '892')."""
    if not text:
        return 0
    text = text.strip().replace(",", "")
    multipliers = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}
    for suffix, mult in multipliers.items():
        if text.upper().endswith(suffix):
            try:
                return int(float(text[:-1]) * mult)
            except ValueError:
                return 0
    try:
        return int(text)
    except ValueError:
        return 0


def get_posted_videos(config: dict, account_id: str | None = None) -> list[dict]:
    """Fetch posted videos from FlashFlow that have TikTok URLs."""
    api_url = config["flashflow_api_url"].rstrip("/")
    api_key = config["flashflow_api_key"]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    videos = []

    if account_id:
        # Lookup by specific account
        resp = httpx.get(
            f"{api_url}/videos/lookup",
            params={"account_id": account_id},
            headers=headers,
            timeout=30,
        )
        data = resp.json()
        if data.get("ok"):
            videos = data.get("data", [])
    else:
        # Get all posted videos from queue
        resp = httpx.get(
            f"{api_url}/videos/queue",
            headers=headers,
            timeout=30,
        )
        data = resp.json()
        if data.get("ok"):
            all_videos = data.get("data", [])
            videos = [v for v in all_videos if v.get("status") == "posted"]

    # Filter to only those with TikTok URLs
    result = []
    for v in videos:
        tiktok_url = v.get("tiktok_url") or v.get("posted_url", "")
        if "tiktok.com" in tiktok_url:
            result.append({
                "id": v["id"],
                "title": v.get("title", ""),
                "tiktok_url": tiktok_url,
            })

    log.info(f"Found {len(result)} posted videos with TikTok URLs")
    return result


async def scrape_tiktok_stats(page, url: str) -> dict | None:
    """Scrape stats from a single TikTok video page."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        # Wait for stats to render
        await page.wait_for_timeout(3000)

        stats = {"views": 0, "likes": 0, "comments": 0, "shares": 0, "saves": 0}

        # Try multiple selector strategies since TikTok changes their DOM frequently

        # Strategy 1: Look for strong tags with data attributes
        try:
            # Views are often in the video description area
            view_el = await page.query_selector('[data-e2e="video-views"]')
            if view_el:
                stats["views"] = parse_count(await view_el.inner_text())
        except Exception:
            pass

        # Strategy 2: Look for action bar buttons
        selectors = {
            "likes": ['[data-e2e="like-count"]', '[data-e2e="browse-like-count"]'],
            "comments": ['[data-e2e="comment-count"]', '[data-e2e="browse-comment-count"]'],
            "shares": ['[data-e2e="share-count"]', '[data-e2e="browse-share-count"]'],
            "saves": ['[data-e2e="undefined-count"]', '[data-e2e="browse-save-count"]'],
        }

        for stat_name, sel_list in selectors.items():
            for sel in sel_list:
                try:
                    el = await page.query_selector(sel)
                    if el:
                        text = await el.inner_text()
                        stats[stat_name] = parse_count(text)
                        break
                except Exception:
                    continue

        # Strategy 3: If views still 0, try parsing from page content
        if stats["views"] == 0:
            try:
                content = await page.content()
                # Look for playCount in JSON-LD or embedded data
                match = re.search(r'"playCount"\s*:\s*(\d+)', content)
                if match:
                    stats["views"] = int(match.group(1))
                # Also try interactionCount
                match = re.search(r'"interactionCount"\s*:\s*(\d+)', content)
                if match and stats["views"] == 0:
                    stats["views"] = int(match.group(1))
            except Exception:
                pass

        # Strategy 4: Parse from meta tags
        if stats["views"] == 0:
            try:
                meta = await page.query_selector('meta[property="og:description"]')
                if meta:
                    desc = await meta.get_attribute("content")
                    if desc:
                        # Format: "123 Likes, 45 Comments. TikTok video from @user"
                        likes_match = re.search(r"([\d.]+[KMB]?)\s*Likes", desc, re.IGNORECASE)
                        if likes_match and stats["likes"] == 0:
                            stats["likes"] = parse_count(likes_match.group(1))
            except Exception:
                pass

        total = sum(stats.values())
        if total == 0:
            log.warning(f"Could not extract any stats from {url}")
            return None

        log.info(f"Stats for {url}: views={stats['views']}, likes={stats['likes']}, comments={stats['comments']}, shares={stats['shares']}")
        return stats

    except Exception as e:
        log.error(f"Failed to scrape {url}: {e}")
        return None


def push_stats(config: dict, video_id: str, stats: dict) -> bool:
    """Push scraped stats to FlashFlow API."""
    api_url = config["flashflow_api_url"].rstrip("/")
    api_key = config["flashflow_api_key"]

    try:
        resp = httpx.post(
            f"{api_url}/videos/{video_id}/stats",
            json=stats,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        data = resp.json()
        if resp.status_code < 300 and data.get("ok"):
            return True
        else:
            log.warning(f"Stats push failed for {video_id}: {data}")
            return False
    except Exception as e:
        log.error(f"Stats push error for {video_id}: {e}")
        return False


def trigger_winner_detection(config: dict) -> dict | None:
    """Trigger batch winner detection after stats update."""
    api_url = config["flashflow_api_url"].rstrip("/")
    api_key = config["flashflow_api_key"]

    try:
        resp = httpx.post(
            f"{api_url}/videos/detect-winners",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        data = resp.json()
        if data.get("ok"):
            log.info(f"Winner detection complete: {data.get('data', {})}")
            return data.get("data")
        else:
            log.warning(f"Winner detection failed: {data}")
            return None
    except Exception as e:
        log.error(f"Winner detection error: {e}")
        return None


async def run_scrape(config: dict, account_id: str | None = None):
    """Main scraping loop."""
    videos = get_posted_videos(config, account_id)
    if not videos:
        log.info("No posted videos with TikTok URLs found.")
        return

    state = load_state()
    success_count = 0
    fail_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720},
        )
        page = await context.new_page()

        for video in videos:
            video_id = video["id"]
            url = video["tiktok_url"]

            log.info(f"Scraping: {video['title'][:50]}... ({url})")
            stats = await scrape_tiktok_stats(page, url)

            if stats:
                if push_stats(config, video_id, stats):
                    success_count += 1
                    state["error_counts"].pop(video_id, None)
                else:
                    fail_count += 1
            else:
                fail_count += 1
                error_count = state["error_counts"].get(video_id, 0) + 1
                state["error_counts"][video_id] = error_count
                if error_count >= 3:
                    log.warning(f"Video {video_id} has failed {error_count} times")

            # Rate limit: wait between requests
            await asyncio.sleep(config.get("delay_between_scrapes", 3))

        await browser.close()

    # Trigger winner detection after all stats updated
    if success_count > 0:
        log.info("Triggering winner detection...")
        trigger_winner_detection(config)

    state["last_scrape"]["timestamp"] = datetime.utcnow().isoformat()
    state["last_scrape"]["success"] = success_count
    state["last_scrape"]["failed"] = fail_count
    save_state(state)

    log.info(f"Scrape complete. Success: {success_count}, Failed: {fail_count}")


def main():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config()

    account_id = None
    if "--account" in sys.argv:
        idx = sys.argv.index("--account")
        if idx + 1 < len(sys.argv):
            account_id = sys.argv[idx + 1]

    if "--daemon" in sys.argv:
        interval = config.get("scrape_interval_hours", 6) * 3600
        log.info(f"Starting daemon mode. Scraping every {interval // 3600} hours.")
        while True:
            try:
                asyncio.run(run_scrape(config, account_id))
            except Exception as e:
                log.error(f"Scrape cycle failed: {e}")
            time.sleep(interval)
    else:
        asyncio.run(run_scrape(config, account_id))


if __name__ == "__main__":
    main()
