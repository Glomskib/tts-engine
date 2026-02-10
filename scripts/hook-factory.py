#!/usr/bin/env python3
"""
FlashFlow Hook Factory

Bulk hook generation using local LLM (free, unlimited).
Generates 20-50 unique hooks per product, scores each for
pattern-interrupt strength, and saves top 10 to Winners Bank.

Usage:
  python hook-factory.py "Turmeric Gummies" --category health
  python hook-factory.py "Desk Organizer" --audience "busy professionals"
  python hook-factory.py --product-id UUID
  python hook-factory.py --all-products    # Generate for all products
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
OUTPUT_DIR = Path(__file__).parent / "hook-output"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger("hook-factory")

# Find API key
API_KEY = os.environ.get("FLASHFLOW_API_KEY", "")
if not API_KEY:
    skill_file = Path.home() / ".openclaw" / "agents" / "flashflow-work" / "workspace" / "skills" / "flashflow" / "skill.md"
    if skill_file.exists():
        match = re.search(r"ff_ak_[a-f0-9]{40}", skill_file.read_text())
        if match:
            API_KEY = match.group(0)

HOOK_FORMULAS = [
    "I can't believe I used to [old way] when [product] exists",
    "POV: you finally found a [product] that actually [benefit]",
    "Stop scrolling if you [pain point]",
    "My [family member] thought I was crazy until they tried this",
    "This $[price] [product] replaced my $[higher price] [alternative]",
    "3 things nobody tells you about [topic]",
    "I've been using [product] for [time] and here's what happened",
    "The #1 mistake people make with [topic]",
    "If you [pain point], you NEED to see this",
    "I found the [product] that TikTok kept showing me and...",
    "Doctor recommended vs what actually works for [condition]",
    "This is the [product] that [viral claim]",
    "Warning: you'll never go back after trying this",
    "Why is nobody talking about this [product]?",
    "The $[price] secret to [benefit]",
]

HOOK_TYPES = [
    "question", "bold_statement", "pov", "curiosity_gap",
    "controversy", "relatable", "story_start", "shock_value",
    "social_proof", "fear_of_missing_out",
]


def lm_generate(prompt: str, max_tokens: int = 1000, temperature: float = 0.8) -> str:
    """Generate text using local LM Studio."""
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
        log.warning(f"LM Studio returned {resp.status_code}")
        return ""
    except Exception as e:
        log.error(f"LM Studio error: {e}")
        return ""


def generate_hooks(product_name: str, category: str = "", audience: str = "", painpoints: list[str] = None, count: int = 30) -> list[dict]:
    """Generate a batch of hooks for a product."""
    log.info(f"Generating {count} hooks for '{product_name}'...")

    painpoints_str = "\n".join(f"- {p}" for p in (painpoints or [])) or "- General consumer pain points"

    prompt = f"""You are a TikTok content strategist specializing in viral hooks.

Generate {count} unique TikTok video hooks for this product:

Product: {product_name}
Category: {category or 'general'}
Target audience: {audience or 'TikTok shoppers, 18-45'}
Key pain points:
{painpoints_str}

RULES:
- Each hook must be 1-2 sentences, under 15 words
- NEVER start with "Hey guys", "Check this out", or generic openers
- Every hook must be a PATTERN INTERRUPT that stops scrolling
- Mix hook types: questions, bold statements, POV, curiosity gaps, controversy, story starts
- Sound like a REAL PERSON, not a marketer
- Each hook should address a specific pain point or desire

Format: Output each hook on a new line, numbered 1-{count}. After each hook, add the hook type in brackets.
Example:
1. I can't believe I spent $200 on supplements before finding this [curiosity_gap]
2. POV: you finally found compression socks that don't slide down [pov]
"""

    response = lm_generate(prompt, max_tokens=2000, temperature=0.9)
    if not response:
        log.error("  No response from LM Studio")
        return []

    # Parse hooks from response
    hooks = []
    for line in response.strip().split("\n"):
        line = line.strip()
        if not line:
            continue

        # Remove numbering
        line = re.sub(r'^\d+[\.\)]\s*', '', line)
        if not line or len(line) < 10:
            continue

        # Extract hook type
        hook_type = "unknown"
        type_match = re.search(r'\[(\w+)\]', line)
        if type_match:
            hook_type = type_match.group(1).lower()
            line = re.sub(r'\s*\[\w+\]\s*$', '', line)

        # Clean up
        line = line.strip('"\'')
        if len(line) < 10 or len(line) > 200:
            continue

        hooks.append({
            "text": line,
            "hook_type": hook_type,
            "product": product_name,
            "score": 0,
        })

    log.info(f"  Parsed {len(hooks)} hooks")
    return hooks


def score_hooks(hooks: list[dict]) -> list[dict]:
    """Score hooks using local LLM for pattern-interrupt strength."""
    log.info(f"Scoring {len(hooks)} hooks...")

    # Batch scoring for efficiency
    batch_size = 10
    for i in range(0, len(hooks), batch_size):
        batch = hooks[i:i+batch_size]
        hooks_text = "\n".join(f"{j+1}. {h['text']}" for j, h in enumerate(batch))

        prompt = f"""Rate each TikTok hook below on a 1-10 scale for "scroll-stopping power".
Consider: Does it create curiosity? Is it a pattern interrupt? Would YOU stop scrolling?

{hooks_text}

Respond with ONLY the scores, one per line, in format: "N. [score]"
Example:
1. 8
2. 6
3. 9"""

        response = lm_generate(prompt, max_tokens=200, temperature=0.3)
        if response:
            scores = re.findall(r'(\d+)\.\s*(\d+)', response)
            for idx_str, score_str in scores:
                idx = int(idx_str) - 1
                if 0 <= idx < len(batch):
                    batch[idx]["score"] = min(int(score_str), 10)

    scored = sum(1 for h in hooks if h["score"] > 0)
    log.info(f"  Scored {scored}/{len(hooks)} hooks")
    return sorted(hooks, key=lambda h: h["score"], reverse=True)


def save_to_winners_bank(hooks: list[dict], top_n: int = 10) -> int:
    """Save top hooks to FlashFlow Winners Bank."""
    if not API_KEY:
        log.warning("  No API key — skipping Winners Bank save")
        return 0

    saved = 0
    for hook in hooks[:top_n]:
        if hook["score"] < 6:  # Only save decent hooks
            continue

        resp = httpx.post(
            f"{API_URL}/winners",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={
                "source_type": "generated",
                "hook": hook["text"],
                "content_format": "product_showcase",
                "product_category": hook.get("category", "general"),
                "notes": f"Hook Factory (LLM score: {hook['score']}/10, type: {hook['hook_type']})",
            },
            timeout=15,
        )
        if resp.status_code < 300:
            saved += 1

    log.info(f"  Saved {saved} hooks to Winners Bank")
    return saved


def save_json_output(hooks: list[dict], product_name: str):
    """Save hooks as JSON for FlashFlow import."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    safe_name = re.sub(r'[^a-zA-Z0-9]', '_', product_name)[:30]
    filepath = OUTPUT_DIR / f"hooks_{safe_name}_{timestamp}.json"

    output = {
        "product": product_name,
        "generated_at": datetime.now().isoformat(),
        "total_hooks": len(hooks),
        "hooks": [
            {
                "text": h["text"],
                "type": h["hook_type"],
                "score": h["score"],
            }
            for h in hooks
        ],
    }

    with open(filepath, "w") as f:
        json.dump(output, f, indent=2)

    log.info(f"  JSON saved to {filepath}")
    return filepath


def get_all_products() -> list[dict]:
    """Fetch all products from FlashFlow."""
    if not API_KEY:
        return []
    resp = httpx.get(
        f"{API_URL}/products",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=15,
    )
    if resp.status_code == 200:
        return resp.json().get("data", [])
    return []


def main():
    JOURNALS_DIR.mkdir(parents=True, exist_ok=True)

    # Parse args
    if "--all-products" in sys.argv:
        products = get_all_products()
        if not products:
            log.error("No products found or API unavailable")
            sys.exit(1)
        for p in products:
            log.info(f"\n{'='*60}")
            log.info(f"Product: {p['name']}")
            hooks = generate_hooks(p["name"], category=p.get("category", ""))
            hooks = score_hooks(hooks)
            save_json_output(hooks, p["name"])
            save_to_winners_bank(hooks)
            time.sleep(2)
        return

    product_name = ""
    category = ""
    audience = ""

    if "--product-id" in sys.argv:
        idx = sys.argv.index("--product-id")
        if idx + 1 < len(sys.argv):
            pid = sys.argv[idx + 1]
            products = get_all_products()
            match = [p for p in products if p.get("id") == pid]
            if match:
                product_name = match[0]["name"]
                category = match[0].get("category", "")
    else:
        # First positional arg is product name
        args = [a for a in sys.argv[1:] if not a.startswith("--")]
        if args:
            product_name = args[0]

    if "--category" in sys.argv:
        idx = sys.argv.index("--category")
        if idx + 1 < len(sys.argv):
            category = sys.argv[idx + 1]

    if "--audience" in sys.argv:
        idx = sys.argv.index("--audience")
        if idx + 1 < len(sys.argv):
            audience = sys.argv[idx + 1]

    if not product_name:
        print("Usage: python hook-factory.py 'Product Name' [--category cat] [--audience aud]")
        print("       python hook-factory.py --all-products")
        sys.exit(1)

    # Check LM Studio
    try:
        resp = httpx.get(f"{LM_STUDIO_URL}/models", timeout=5)
        if resp.status_code != 200:
            log.error("LM Studio not responding. Start LM Studio first.")
            sys.exit(1)
    except httpx.ConnectError:
        log.error("LM Studio not running at localhost:1234")
        sys.exit(1)

    log.info(f"Hook Factory: {product_name}")
    log.info(f"Category: {category or 'general'}, Audience: {audience or 'default'}")

    # Generate
    hooks = generate_hooks(product_name, category, audience, count=30)
    if not hooks:
        log.error("No hooks generated")
        sys.exit(1)

    # Score
    hooks = score_hooks(hooks)

    # Save
    save_json_output(hooks, product_name)
    saved = save_to_winners_bank(hooks)

    # Summary
    print(f"\n{'='*60}")
    print(f"  Hook Factory Results: {product_name}")
    print(f"{'='*60}")
    print(f"  Total generated: {len(hooks)}")
    print(f"  Saved to Winners Bank: {saved}")
    print(f"\n  Top 10 hooks:")
    for i, h in enumerate(hooks[:10]):
        print(f"  {i+1}. [{h['score']}/10] {h['text'][:70]}")
    print()


if __name__ == "__main__":
    main()
