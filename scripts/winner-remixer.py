#!/usr/bin/env python3
"""
FlashFlow Winner Remixer

Takes winning content and creates variations using local LLM.
5 angle variations per winner: emotion, format, audience, hook style, length.
Saves all variations to Script Library via API.

Usage:
  python winner-remixer.py WINNER_ID
  python winner-remixer.py --latest          # Remix most recent winner
  python winner-remixer.py --all             # Remix all winners
  python winner-remixer.py --product "Name"  # Remix winners for a product
"""

import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

# --- Configuration ---

LM_STUDIO_URL = "http://127.0.0.1:1234/v1"
API_URL = "https://web-pied-delta-30.vercel.app/api"
JOURNALS_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger("winner-remixer")

API_KEY = os.environ.get("FLASHFLOW_API_KEY", "")
if not API_KEY:
    skill_file = Path.home() / ".openclaw" / "agents" / "flashflow-work" / "workspace" / "skills" / "flashflow" / "skill.md"
    if skill_file.exists():
        match = re.search(r"ff_ak_[a-f0-9]{40}", skill_file.read_text())
        if match:
            API_KEY = match.group(0)

VARIATION_TYPES = [
    {
        "name": "emotion_shift",
        "label": "Different Emotion",
        "prompt": """Rewrite this winning TikTok hook/script with a DIFFERENT emotional angle.
Original emotion: {original_emotion}
New emotions to try: curiosity, excitement, fear of missing out, humor, shock, empathy

Keep the same product and core message, but change the emotional trigger.
The hook must still be a pattern interrupt that stops scrolling.""",
    },
    {
        "name": "format_change",
        "label": "Different Format",
        "prompt": """Convert this winning TikTok content to a DIFFERENT content format.
Original format: {original_format}
Choose one of: testimonial, skit/comedy, voiceover explainer, product showcase, face-on-camera (BOF)

Keep the same product and hook angle, but completely change the format and structure.
Include scene-by-scene breakdown.""",
    },
    {
        "name": "audience_pivot",
        "label": "Different Audience",
        "prompt": """Rewrite this winning TikTok hook/script targeting a DIFFERENT audience.
Original angle: {original_angle}
New angles to try: pain-focused, benefit-focused, luxury/aspirational, budget-conscious, health-conscious, parent perspective

Same product, completely different target audience and messaging.""",
    },
    {
        "name": "hook_restyle",
        "label": "Different Hook Style",
        "prompt": """Rewrite JUST the hook of this winning TikTok video using a different hook style.
Original hook style: {original_hook_style}
Try one of: question hook, bold statement, POV, curiosity gap, controversy, story start, relatable moment, shock value

The rest of the script can stay similar, but the first 1-3 seconds must be completely different.""",
    },
    {
        "name": "length_adapt",
        "label": "Different Length",
        "prompt": """Adapt this winning TikTok content to a DIFFERENT video length.
Original length: ~{original_length}s
Create versions for: 15 seconds (ultra-short), 30 seconds (standard), 60 seconds (long-form)

For shorter: cut to just hook + product + CTA
For longer: add more detail, social proof, multiple benefits""",
    },
]


def api_call(method: str, endpoint: str, json_body: dict = None, params: dict = None) -> dict:
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    url = f"{API_URL}{endpoint}"
    try:
        if method == "GET":
            resp = httpx.get(url, headers=headers, params=params, timeout=30)
        elif method == "POST":
            resp = httpx.post(url, headers=headers, json=json_body or {}, timeout=60)
        else:
            return {"ok": False}
        return {"ok": resp.status_code < 300, "data": resp.json()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def lm_generate(prompt: str, max_tokens: int = 800, temperature: float = 0.8) -> str:
    try:
        resp = httpx.post(
            f"{LM_STUDIO_URL}/chat/completions",
            json={
                "model": "llama-3.1-8b-instruct",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
            timeout=120,
        )
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]
        return ""
    except Exception as e:
        log.warning(f"LM Studio error: {e}")
        return ""


def get_winner(winner_id: str) -> dict | None:
    """Fetch a winner from FlashFlow."""
    r = api_call("GET", f"/winners/{winner_id}")
    if r["ok"]:
        return r["data"].get("data")
    return None


def get_winners(limit: int = 10, product: str = None) -> list[dict]:
    """Fetch winners list."""
    params = {"limit": str(limit), "sort": "recent"}
    r = api_call("GET", "/winners", params=params)
    if r["ok"]:
        winners = r["data"].get("data", [])
        if product:
            winners = [w for w in winners if product.lower() in (w.get("product_category", "") or "").lower()
                       or product.lower() in (w.get("hook", "") or "").lower()]
        return winners
    return []


def remix_winner(winner: dict) -> list[dict]:
    """Generate 5 variations of a winning piece of content."""
    hook = winner.get("hook", "")
    full_script = winner.get("full_script", hook)
    content_format = winner.get("content_format", "unknown")
    category = winner.get("product_category", "general")

    log.info(f"Remixing winner: '{hook[:60]}...'")
    variations = []

    for var_type in VARIATION_TYPES:
        log.info(f"  Generating {var_type['label']}...")

        context_prompt = f"""You are a TikTok content strategist. Here is a WINNING TikTok video that performed well:

ORIGINAL HOOK: {hook}

ORIGINAL SCRIPT:
{full_script[:800]}

CONTENT FORMAT: {content_format}
PRODUCT CATEGORY: {category}

YOUR TASK:
{var_type['prompt'].format(
    original_emotion="engaging/direct",
    original_format=content_format,
    original_angle="general consumer",
    original_hook_style="direct statement",
    original_length="30",
)}

Write the complete new version with:
1. HOOK (first 1-3 seconds, the most important part)
2. SCENE BEATS (3-5 scenes with action and dialogue)
3. CTA (call to action)

Keep it authentic — sound like a real person, not a marketer."""

        response = lm_generate(context_prompt, max_tokens=800, temperature=0.85)
        if not response:
            log.warning(f"    No response for {var_type['name']}")
            continue

        # Extract hook from response
        new_hook = ""
        lines = response.strip().split("\n")
        for line in lines:
            if "hook" in line.lower() and ":" in line:
                new_hook = line.split(":", 1)[1].strip().strip('"\'')
                break
        if not new_hook and lines:
            # Use first non-empty line
            for line in lines:
                clean = line.strip().strip("*#-1234567890. ")
                if len(clean) > 10:
                    new_hook = clean[:150]
                    break

        variations.append({
            "type": var_type["name"],
            "label": var_type["label"],
            "hook": new_hook[:200],
            "full_script": response[:2000],
            "original_winner_id": winner.get("id"),
        })

        log.info(f"    Hook: {new_hook[:60]}")
        time.sleep(1)

    return variations


def save_variations(winner: dict, variations: list[dict]) -> int:
    """Save variations to FlashFlow Script Library."""
    if not API_KEY:
        log.warning("No API key — skipping save")
        return 0

    saved = 0
    for var in variations:
        # Build skit data structure
        skit_data = {
            "hook": {"line": var["hook"]},
            "beats": [
                {"action": "See full script in notes", "dialogue": var["full_script"][:500]},
            ],
            "cta": "Check link in bio",
        }

        r = api_call("POST", "/skits", {
            "title": f"[{var['label']}] {var['hook'][:80]}",
            "status": "draft",
            "product_id": winner.get("product_id"),
            "skit_data": skit_data,
        })

        if r["ok"]:
            saved += 1
            log.info(f"    Saved: {var['label']}")
        else:
            log.warning(f"    Failed to save {var['label']}: {r.get('error', '')}")

    return saved


def main():
    JOURNALS_DIR.mkdir(parents=True, exist_ok=True)

    if not API_KEY:
        log.error("No FlashFlow API key found")
        sys.exit(1)

    # Check LM Studio
    try:
        resp = httpx.get(f"{LM_STUDIO_URL}/models", timeout=5)
        if resp.status_code != 200:
            log.error("LM Studio not responding")
            sys.exit(1)
    except httpx.ConnectError:
        log.error("LM Studio not running at localhost:1234")
        sys.exit(1)

    # Determine which winners to remix
    winners = []

    if "--latest" in sys.argv:
        all_winners = get_winners(limit=1)
        if all_winners:
            winners = [all_winners[0]]
        else:
            log.error("No winners found")
            sys.exit(1)

    elif "--all" in sys.argv:
        winners = get_winners(limit=20)

    elif "--product" in sys.argv:
        idx = sys.argv.index("--product")
        if idx + 1 < len(sys.argv):
            product = sys.argv[idx + 1]
            winners = get_winners(limit=10, product=product)
            if not winners:
                log.error(f"No winners found for product '{product}'")
                sys.exit(1)

    else:
        # Positional arg = winner ID
        args = [a for a in sys.argv[1:] if not a.startswith("--")]
        if args:
            winner = get_winner(args[0])
            if winner:
                winners = [winner]
            else:
                log.error(f"Winner '{args[0]}' not found")
                sys.exit(1)
        else:
            print("Usage: python winner-remixer.py WINNER_ID")
            print("       python winner-remixer.py --latest")
            print("       python winner-remixer.py --all")
            print("       python winner-remixer.py --product 'Product Name'")
            sys.exit(1)

    log.info(f"Remixing {len(winners)} winner(s)...")

    total_saved = 0
    total_variations = 0

    for winner in winners:
        variations = remix_winner(winner)
        total_variations += len(variations)

        saved = save_variations(winner, variations)
        total_saved += saved

        log.info(f"  Winner '{winner.get('hook', '')[:40]}': {len(variations)} variations, {saved} saved")
        time.sleep(2)

    # Summary
    print(f"\n{'='*60}")
    print(f"  Winner Remixer Results")
    print(f"{'='*60}")
    print(f"  Winners processed: {len(winners)}")
    print(f"  Variations generated: {total_variations}")
    print(f"  Saved to Script Library: {total_saved}")
    print()

    # Log to journal
    today = datetime.now().strftime("%Y-%m-%d")
    journal_path = JOURNALS_DIR / f"{today}-winner-remixer.md"
    with open(journal_path, "a") as f:
        f.write(f"\n## Winner Remixer Run — {datetime.now().strftime('%H:%M')}\n")
        f.write(f"- Winners: {len(winners)}, Variations: {total_variations}, Saved: {total_saved}\n")


if __name__ == "__main__":
    main()
