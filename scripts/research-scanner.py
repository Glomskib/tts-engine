#!/usr/bin/env python3
"""
Reddit & Web Research Scanner for FlashFlow

Scans Reddit subreddits and web sources for trending products,
content ideas, and community insights relevant to FlashFlow's
content strategy.

Sources:
  - Reddit: r/TikTokShop, r/printOnDemand, r/ehlersdanlos, r/POTS,
            r/dropshipping, r/Entrepreneur
  - Google Trends (via pytrends, optional)

Output:
  - Research notes in ~/.openclaw/workspace/second-brain/research/
  - High-value leads pushed to FlashFlow pipeline

Usage:
  python research-scanner.py              # Scan all sources once
  python research-scanner.py --daemon     # Scan every 4 hours
  python research-scanner.py --subreddit tiktokshop  # Scan specific sub
"""

import json
import logging
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import httpx

# --- Configuration ---

CONFIG_PATH = Path(__file__).parent / "research-scanner-config.json"
STATE_PATH = Path(__file__).parent / ".research-scanner-state.json"
LOG_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"
RESEARCH_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "research"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "research-scanner.log", mode="a"),
    ],
)
log = logging.getLogger("research-scanner")

# --- Default subreddits to monitor ---

DEFAULT_SUBREDDITS = [
    {
        "name": "TikTokShop",
        "category": "tiktok_trends",
        "keywords": ["trending", "viral", "best seller", "commission", "affiliate", "blowing up", "sales"],
    },
    {
        "name": "printOnDemand",
        "category": "pod_trends",
        "keywords": ["trending", "best seller", "niche", "design", "sales", "etsy", "merch"],
    },
    {
        "name": "ehlersdanlos",
        "category": "chronic_illness",
        "keywords": ["product", "help", "recommend", "changed my life", "game changer", "wish I knew"],
    },
    {
        "name": "POTS",
        "category": "chronic_illness",
        "keywords": ["product", "supplement", "electrolyte", "compression", "help", "recommend"],
    },
    {
        "name": "dropshipping",
        "category": "ecommerce",
        "keywords": ["winning product", "trending", "supplier", "tiktok", "viral", "sales"],
    },
    {
        "name": "Entrepreneur",
        "category": "business",
        "keywords": ["tiktok", "social media", "content", "viral", "e-commerce", "side hustle"],
    },
]

# --- URL patterns ---
TIKTOK_URL_RE = re.compile(r"https?://(?:www\.)?tiktok\.com/\S+", re.IGNORECASE)
AMAZON_URL_RE = re.compile(r"https?://(?:www\.)?amazon\.com/\S+", re.IGNORECASE)
PRODUCT_URL_RE = re.compile(r"https?://\S+(?:product|shop|item|listing)\S*", re.IGNORECASE)

# --- Reddit API (no auth, public JSON) ---

REDDIT_USER_AGENT = "FlashFlow-ResearchBot/1.0 (research scanner)"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {
        "subreddits": DEFAULT_SUBREDDITS,
        "flashflow_api_url": "",
        "flashflow_api_key": "",
        "scan_interval_hours": 4,
        "posts_per_subreddit": 25,
        "min_upvotes": 5,
    }


def load_state() -> dict:
    if STATE_PATH.exists():
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"seen_post_ids": [], "last_scan": {}}


def save_state(state: dict):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def fetch_subreddit_posts(subreddit: str, sort: str = "hot", limit: int = 25) -> list[dict]:
    """Fetch posts from a subreddit using public JSON API."""
    url = f"https://www.reddit.com/r/{subreddit}/{sort}.json"
    headers = {"User-Agent": REDDIT_USER_AGENT}

    try:
        resp = httpx.get(url, headers=headers, params={"limit": limit}, timeout=15, follow_redirects=True)
        if resp.status_code != 200:
            log.warning(f"Reddit returned {resp.status_code} for r/{subreddit}")
            return []

        data = resp.json()
        posts = []
        for child in data.get("data", {}).get("children", []):
            post = child.get("data", {})
            posts.append({
                "id": post.get("id", ""),
                "title": post.get("title", ""),
                "selftext": post.get("selftext", ""),
                "url": post.get("url", ""),
                "permalink": f"https://reddit.com{post.get('permalink', '')}",
                "score": post.get("score", 0),
                "num_comments": post.get("num_comments", 0),
                "created_utc": post.get("created_utc", 0),
                "author": post.get("author", ""),
                "subreddit": subreddit,
                "link_flair_text": post.get("link_flair_text", ""),
            })
        return posts

    except Exception as e:
        log.error(f"Error fetching r/{subreddit}: {e}")
        return []


def score_relevance(post: dict, keywords: list[str]) -> int:
    """Score a post's relevance to our content strategy."""
    score = 0
    text = f"{post['title']} {post['selftext']}".lower()

    # Keyword matches
    for kw in keywords:
        if kw.lower() in text:
            score += 10

    # High engagement
    if post["score"] >= 100:
        score += 15
    elif post["score"] >= 50:
        score += 10
    elif post["score"] >= 20:
        score += 5

    # Active discussion
    if post["num_comments"] >= 50:
        score += 10
    elif post["num_comments"] >= 20:
        score += 5

    # Contains product links
    if TIKTOK_URL_RE.search(text) or AMAZON_URL_RE.search(text):
        score += 15
    if PRODUCT_URL_RE.search(text):
        score += 10

    # Recency bonus (last 24h)
    age_hours = (time.time() - post["created_utc"]) / 3600
    if age_hours < 6:
        score += 10
    elif age_hours < 24:
        score += 5

    return score


def extract_product_leads(post: dict) -> list[str]:
    """Extract product-related URLs from a post."""
    text = f"{post['title']} {post['selftext']} {post['url']}"
    leads = []
    leads.extend(TIKTOK_URL_RE.findall(text))
    leads.extend(AMAZON_URL_RE.findall(text))
    leads.extend(PRODUCT_URL_RE.findall(text))
    return list(set(leads))


def save_research_note(category: str, posts: list[dict]):
    """Save a research digest to the research folder."""
    if not posts:
        return

    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    filename = f"{today}-reddit-{category}.md"
    filepath = RESEARCH_DIR / filename

    content = f"# Reddit Research: {category}\n"
    content += f"**Scanned:** {datetime.now().strftime('%Y-%m-%d %H:%M')} | **Posts:** {len(posts)}\n\n"

    for post in posts:
        age_hours = (time.time() - post["created_utc"]) / 3600
        age_str = f"{age_hours:.0f}h ago" if age_hours < 24 else f"{age_hours / 24:.0f}d ago"

        content += f"---\n"
        content += f"### [{post['title']}]({post['permalink']})\n"
        content += f"**r/{post['subreddit']}** | Score: {post['score']} | Comments: {post['num_comments']} | {age_str}\n"

        if post.get("link_flair_text"):
            content += f"**Flair:** {post['link_flair_text']}\n"

        if post["selftext"]:
            # Truncate long posts
            body = post["selftext"][:400]
            if len(post["selftext"]) > 400:
                body += "..."
            content += f"\n> {body}\n"

        leads = extract_product_leads(post)
        if leads:
            content += f"\n**Product links:** {', '.join(leads[:3])}\n"

        content += f"**Relevance score:** {post.get('relevance_score', 0)}\n\n"

    with open(filepath, "w") as f:
        f.write(content)

    log.info(f"Saved {len(posts)} posts to {filename}")


def push_lead_to_flashflow(config: dict, post: dict) -> bool:
    """Push a high-value product lead to FlashFlow pipeline."""
    api_url = config.get("flashflow_api_url", "").rstrip("/")
    api_key = config.get("flashflow_api_key", "")

    if not api_url or not api_key:
        return False

    leads = extract_product_leads(post)
    notes = f"Reddit lead from r/{post['subreddit']} (score: {post['score']}, comments: {post['num_comments']})\n\n"
    notes += f"Title: {post['title']}\n"
    notes += f"Link: {post['permalink']}\n"
    if leads:
        notes += f"Product URLs: {', '.join(leads[:3])}\n"
    if post["selftext"]:
        notes += f"\nExcerpt: {post['selftext'][:300]}"

    payload = {
        "title": f"Reddit Lead: {post['title'][:80]}",
        "status": "needs_script",
        "source": "research-scanner",
        "notes": notes,
    }

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
            log.info(f"Created FlashFlow entry for Reddit lead: {post['title'][:60]}")
            return True
        else:
            log.warning(f"FlashFlow API error: {data}")
            return False
    except Exception as e:
        log.error(f"Failed to push lead: {e}")
        return False


def scan_subreddit(config: dict, sub_config: dict, state: dict) -> list[dict]:
    """Scan a single subreddit and return relevant posts."""
    name = sub_config["name"]
    keywords = sub_config.get("keywords", [])
    category = sub_config.get("category", "general")
    min_upvotes = config.get("min_upvotes", 5)
    limit = config.get("posts_per_subreddit", 25)

    seen_ids = set(state.get("seen_post_ids", []))

    log.info(f"Scanning r/{name} ({category})...")

    # Fetch hot and new posts
    posts = []
    for sort in ["hot", "new"]:
        fetched = fetch_subreddit_posts(name, sort=sort, limit=limit)
        posts.extend(fetched)
        time.sleep(1)  # Rate limit

    # Deduplicate
    unique_posts = {}
    for p in posts:
        if p["id"] not in unique_posts:
            unique_posts[p["id"]] = p
    posts = list(unique_posts.values())

    # Filter and score
    relevant = []
    for post in posts:
        if post["id"] in seen_ids:
            continue
        if post["score"] < min_upvotes:
            continue

        relevance = score_relevance(post, keywords)
        if relevance >= 15:  # Minimum relevance threshold
            post["relevance_score"] = relevance
            relevant.append(post)
            seen_ids.add(post["id"])

    # Sort by relevance
    relevant.sort(key=lambda p: p["relevance_score"], reverse=True)

    # Keep top 10
    relevant = relevant[:10]

    log.info(f"r/{name}: {len(posts)} posts scanned, {len(relevant)} relevant")

    return relevant


def run_scan(config: dict, target_subreddit: str | None = None):
    """Run a full scan of all configured subreddits."""
    state = load_state()
    subreddits = config.get("subreddits", DEFAULT_SUBREDDITS)

    if target_subreddit:
        subreddits = [s for s in subreddits if s["name"].lower() == target_subreddit.lower()]
        if not subreddits:
            log.error(f"Subreddit '{target_subreddit}' not found in config")
            return

    all_relevant = {}
    pipeline_leads = 0

    for sub_config in subreddits:
        category = sub_config.get("category", "general")
        relevant = scan_subreddit(config, sub_config, state)

        if category not in all_relevant:
            all_relevant[category] = []
        all_relevant[category].extend(relevant)

        # Push high-value leads (score >= 40) to FlashFlow
        for post in relevant:
            if post["relevance_score"] >= 40:
                if push_lead_to_flashflow(config, post):
                    pipeline_leads += 1

        time.sleep(2)  # Rate limit between subreddits

    # Save research notes grouped by category
    for category, posts in all_relevant.items():
        save_research_note(category, posts)

    # Update state
    # Keep last 10000 seen IDs to prevent unbounded growth
    existing = state.get("seen_post_ids", [])
    new_ids = []
    for posts in all_relevant.values():
        new_ids.extend(p["id"] for p in posts)
    state["seen_post_ids"] = (existing + new_ids)[-10000:]
    state["last_scan"] = {
        "timestamp": datetime.utcnow().isoformat(),
        "total_relevant": sum(len(p) for p in all_relevant.values()),
        "pipeline_leads": pipeline_leads,
    }
    save_state(state)

    total = sum(len(p) for p in all_relevant.values())
    log.info(f"Scan complete. {total} relevant posts found, {pipeline_leads} pushed to pipeline.")


def main():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config()

    target = None
    if "--subreddit" in sys.argv:
        idx = sys.argv.index("--subreddit")
        if idx + 1 < len(sys.argv):
            target = sys.argv[idx + 1]

    if "--daemon" in sys.argv:
        interval = config.get("scan_interval_hours", 4) * 3600
        log.info(f"Starting daemon mode. Scanning every {interval // 3600} hours.")
        while True:
            try:
                run_scan(config, target)
            except Exception as e:
                log.error(f"Scan cycle failed: {e}")
            time.sleep(interval)
    else:
        run_scan(config, target)


if __name__ == "__main__":
    main()
