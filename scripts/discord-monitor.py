#!/usr/bin/env python3
"""
Discord Channel Monitor for FlashFlow

Monitors specified Discord channels for trending product links,
competitor insights, and content ideas. Extracts actionable data
and stores it in FlashFlow's research pipeline.

Channels monitored:
  - TikTok Shop deals/trends channels
  - POD (print-on-demand) communities
  - Competitor intel channels

Usage:
  python discord-monitor.py              # Run once (scan recent messages)
  python discord-monitor.py --daemon     # Run continuously
"""

import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import discord
import httpx

# --- Configuration ---

CONFIG_PATH = Path(__file__).parent / "discord-monitor-config.json"
STATE_PATH = Path(__file__).parent / ".discord-monitor-state.json"
LOG_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"
RESEARCH_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "research"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "discord-monitor.log", mode="a"),
    ],
)
log = logging.getLogger("discord-monitor")

# --- Patterns for extracting useful data ---

TIKTOK_URL_RE = re.compile(r"https?://(?:www\.)?tiktok\.com/@[\w.-]+/video/\d+", re.IGNORECASE)
TIKTOK_SHOP_RE = re.compile(r"https?://(?:www\.)?tiktok\.com/.*(?:product|shop)", re.IGNORECASE)
AMAZON_RE = re.compile(r"https?://(?:www\.)?amazon\.com/(?:dp|gp/product)/[\w]+", re.IGNORECASE)
PRICE_RE = re.compile(r"\$[\d,]+(?:\.\d{2})?")
VIEWS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*[KkMm]?\s*(?:views|plays)", re.IGNORECASE)

# Keywords that indicate trending/hot products
TREND_KEYWORDS = [
    "trending", "viral", "blowing up", "selling fast", "hot product",
    "best seller", "top seller", "commission", "affiliate",
    "just launched", "new drop", "going crazy", "sold out",
]

# Keywords for content strategy insights
STRATEGY_KEYWORDS = [
    "hook", "cta", "call to action", "script", "caption",
    "hashtag", "sound", "trending sound", "algorithm",
    "fyp", "for you page", "engagement", "conversion",
]


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log.error(f"Config not found at {CONFIG_PATH}. Copy discord-monitor-config.example.json and fill in values.")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return json.load(f)


def load_state() -> dict:
    if STATE_PATH.exists():
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"last_scan": {}, "seen_message_ids": []}


def save_state(state: dict):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def extract_insights(message_content: str) -> dict:
    """Extract structured data from a Discord message."""
    insights = {
        "tiktok_urls": TIKTOK_URL_RE.findall(message_content),
        "shop_urls": TIKTOK_SHOP_RE.findall(message_content),
        "amazon_urls": AMAZON_RE.findall(message_content),
        "prices": PRICE_RE.findall(message_content),
        "views": VIEWS_RE.findall(message_content),
        "has_trend_signal": any(kw in message_content.lower() for kw in TREND_KEYWORDS),
        "has_strategy_signal": any(kw in message_content.lower() for kw in STRATEGY_KEYWORDS),
    }
    return insights


def categorize_message(insights: dict) -> str | None:
    """Determine the category of actionable message."""
    if insights["shop_urls"] or insights["amazon_urls"]:
        return "product_lead"
    if insights["tiktok_urls"] and insights["has_trend_signal"]:
        return "trending_content"
    if insights["has_strategy_signal"]:
        return "strategy_insight"
    if insights["has_trend_signal"]:
        return "trend_signal"
    return None


def save_research_note(category: str, channel_name: str, author: str, content: str, insights: dict):
    """Save extracted insight to the research folder as a markdown note."""
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    filename = f"{today}-discord-{category}.md"
    filepath = RESEARCH_DIR / filename

    entry = f"\n---\n**Channel:** #{channel_name} | **From:** {author} | **Time:** {datetime.now().strftime('%H:%M')}\n\n"
    entry += f"> {content[:500]}\n\n"

    if insights["shop_urls"]:
        entry += f"**Shop URLs:** {', '.join(insights['shop_urls'])}\n"
    if insights["tiktok_urls"]:
        entry += f"**TikTok URLs:** {', '.join(insights['tiktok_urls'])}\n"
    if insights["amazon_urls"]:
        entry += f"**Amazon URLs:** {', '.join(insights['amazon_urls'])}\n"
    if insights["prices"]:
        entry += f"**Prices mentioned:** {', '.join(insights['prices'])}\n"

    with open(filepath, "a") as f:
        f.write(entry)

    log.info(f"Saved {category} insight from #{channel_name} to {filename}")


def post_to_flashflow(config: dict, category: str, content: str, insights: dict) -> bool:
    """Post high-value leads to FlashFlow as research entries."""
    if category != "product_lead":
        return False

    api_url = config["flashflow_api_url"].rstrip("/")
    api_key = config["flashflow_api_key"]

    # Extract product info from the message for pipeline entry
    payload = {
        "title": f"Discord Lead: {content[:80]}",
        "status": "needs_script",
        "source": "discord-monitor",
        "notes": f"Auto-imported from Discord.\n\nOriginal message:\n{content[:500]}",
    }

    if insights["shop_urls"]:
        payload["notes"] += f"\n\nShop URL: {insights['shop_urls'][0]}"

    try:
        resp = httpx.post(
            f"{api_url}/videos",
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        data = resp.json()
        if resp.status_code < 300 and data.get("ok"):
            log.info(f"Created FlashFlow pipeline entry for Discord lead")
            return True
        else:
            log.warning(f"FlashFlow API error: {data}")
            return False
    except Exception as e:
        log.error(f"Failed to post to FlashFlow: {e}")
        return False


class MonitorClient(discord.Client):
    """Discord client that monitors channels for actionable messages."""

    def __init__(self, config: dict, run_once: bool = False, **kwargs):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents, **kwargs)
        self.config = config
        self.run_once = run_once
        self.watch_channel_ids = set(config.get("watch_channel_ids", []))
        self.state = load_state()
        self.seen_ids = set(self.state.get("seen_message_ids", []))
        self.processed_count = 0

    async def on_ready(self):
        log.info(f"Logged in as {self.user} (ID: {self.user.id})")
        log.info(f"Watching {len(self.watch_channel_ids)} channels")

        if self.run_once:
            await self.scan_recent_messages()
            await self.close()

    async def scan_recent_messages(self):
        """Scan recent messages in watched channels (run-once mode)."""
        lookback = timedelta(hours=self.config.get("lookback_hours", 24))
        after = datetime.now(timezone.utc) - lookback

        for channel_id in self.watch_channel_ids:
            channel = self.get_channel(int(channel_id))
            if not channel:
                log.warning(f"Channel {channel_id} not found or not accessible")
                continue

            log.info(f"Scanning #{channel.name} (last {lookback.total_seconds() / 3600:.0f}h)...")
            try:
                async for message in channel.history(after=after, limit=200):
                    await self.process_message(message)
            except discord.Forbidden:
                log.warning(f"No permission to read #{channel.name}")
            except Exception as e:
                log.error(f"Error scanning #{channel.name}: {e}")

        # Save state
        self.state["seen_message_ids"] = list(self.seen_ids)[-5000:]  # Keep last 5000
        self.state["last_scan"][str(channel_id)] = datetime.now(timezone.utc).isoformat()
        save_state(self.state)
        log.info(f"Scan complete. Processed {self.processed_count} new actionable messages.")

    async def on_message(self, message: discord.Message):
        """Handle real-time messages in daemon mode."""
        if str(message.channel.id) not in self.watch_channel_ids:
            return
        if message.author.bot:
            return
        await self.process_message(message)

    async def process_message(self, message: discord.Message):
        """Process a single message for actionable content."""
        msg_id = str(message.id)
        if msg_id in self.seen_ids:
            return

        self.seen_ids.add(msg_id)
        content = message.content
        if not content or len(content) < 20:
            return

        insights = extract_insights(content)
        category = categorize_message(insights)

        if not category:
            return

        self.processed_count += 1
        channel_name = getattr(message.channel, "name", "unknown")
        author_name = str(message.author)

        log.info(f"[{category}] #{channel_name} by {author_name}: {content[:100]}...")

        # Save to research notes
        save_research_note(category, channel_name, author_name, content, insights)

        # Post product leads to FlashFlow
        if category == "product_lead":
            post_to_flashflow(self.config, category, content, insights)

        # Periodically save state in daemon mode
        if self.processed_count % 10 == 0:
            self.state["seen_message_ids"] = list(self.seen_ids)[-5000:]
            save_state(self.state)


def main():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config()

    if not config.get("discord_bot_token"):
        log.error("discord_bot_token not set in config")
        sys.exit(1)

    run_once = "--daemon" not in sys.argv
    client = MonitorClient(config, run_once=run_once)

    if run_once:
        log.info("Running single scan of recent messages...")
    else:
        log.info("Starting daemon mode — monitoring channels in real-time...")

    client.run(config["discord_bot_token"])


if __name__ == "__main__":
    main()
