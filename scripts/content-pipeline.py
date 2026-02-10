#!/usr/bin/env python3
"""
FlashFlow Content Generation Pipeline

Automated content assembly line:
  1. Research: Pull trending products from Reddit/research notes
  2. Select: Score products by potential
  3. Generate: Call FlashFlow API to generate scripts per top product
  4. Score: Use local LLM to rate each script
  5. Queue: Scripts scoring 7+ auto-added to pipeline
  6. Brief: Create VA brief for each queued script
  7. Report: Log everything to second-brain/journals/

Usage:
  python content-pipeline.py                     # Run full pipeline
  python content-pipeline.py --product "Turmeric" # Generate for specific product
  python content-pipeline.py --scripts-only       # Skip research, just generate
  python content-pipeline.py --dry-run            # Preview without API calls
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

SCRIPTS_DIR = Path(__file__).parent
RESEARCH_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "research"
JOURNALS_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"
CONFIG_PATH = SCRIPTS_DIR / "content-pipeline-config.json"

LM_STUDIO_URL = "http://127.0.0.1:1234/v1"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(JOURNALS_DIR / "content-pipeline.log", mode="a"),
    ],
)
log = logging.getLogger("content-pipeline")

# Find API key
API_KEY = os.environ.get("FLASHFLOW_API_KEY", "")
if not API_KEY:
    skill_file = Path.home() / ".openclaw" / "agents" / "flashflow-work" / "workspace" / "skills" / "flashflow" / "skill.md"
    if skill_file.exists():
        match = re.search(r"ff_ak_[a-f0-9]{40}", skill_file.read_text())
        if match:
            API_KEY = match.group(0)

API_URL = "https://web-pied-delta-30.vercel.app/api"

CONTENT_TYPES = [
    "product_showcase",
    "ugc_testimonial",
    "skit_comedy",
    "voiceover_explainer",
    "face_on_camera",
]


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {
        "scripts_per_product": 3,
        "min_score": 7,
        "max_products": 5,
        "use_local_llm": True,
    }


def api_call(method: str, endpoint: str, json_body: dict = None, params: dict = None) -> dict:
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    url = f"{API_URL}{endpoint}"
    try:
        if method == "GET":
            resp = httpx.get(url, headers=headers, params=params, timeout=30)
        elif method == "POST":
            resp = httpx.post(url, headers=headers, json=json_body or {}, timeout=60)
        else:
            return {"ok": False, "error": f"Unknown method {method}"}
        return {"ok": resp.status_code < 300, "status": resp.status_code, "data": resp.json()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def lm_studio_generate(prompt: str, max_tokens: int = 500, temperature: float = 0.7) -> str:
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
            timeout=60,
        )
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]
        return ""
    except Exception as e:
        log.warning(f"LM Studio error: {e}")
        return ""


# --- Pipeline Steps ---

def step1_research() -> list[dict]:
    """Pull trending products from recent research notes."""
    log.info("Step 1: Scanning research notes for trending products...")
    products = []

    # Read recent research files
    if RESEARCH_DIR.exists():
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now().replace(day=datetime.now().day)).strftime("%Y-%m-%d")

        for f in sorted(RESEARCH_DIR.glob("*.md"), reverse=True)[:10]:
            content = f.read_text()
            # Extract product mentions
            # Look for lines with product-like patterns
            for line in content.split("\n"):
                if any(kw in line.lower() for kw in ["product", "trending", "viral", "best seller", "commission"]):
                    # Extract product name (crude but functional)
                    clean = re.sub(r'[*#\[\]`]', '', line).strip()
                    if len(clean) > 10 and len(clean) < 200:
                        products.append({
                            "name": clean[:80],
                            "source": f.name,
                            "score": 0,
                        })

    # Also get products from FlashFlow that need scripts
    r = api_call("GET", "/products")
    if r["ok"]:
        for p in r["data"].get("data", []):
            products.append({
                "id": p.get("id"),
                "name": p.get("name", ""),
                "brand": p.get("brand", ""),
                "source": "flashflow_catalog",
                "score": 10,  # Existing products get priority
            })

    log.info(f"  Found {len(products)} product candidates")
    return products


def step2_select(products: list[dict], config: dict) -> list[dict]:
    """Score and select top products for content generation."""
    log.info("Step 2: Scoring and selecting top products...")

    # Score products
    for p in products:
        score = p.get("score", 0)
        name_lower = p["name"].lower()

        # Boost for trending keywords
        if any(kw in name_lower for kw in ["trending", "viral", "hot"]):
            score += 5
        if any(kw in name_lower for kw in ["turmeric", "collagen", "supplement", "health"]):
            score += 3  # Brandon's niche
        if any(kw in name_lower for kw in ["compression", "electrolyte", "eds", "pots"]):
            score += 4  # Chronic illness niche
        if p.get("source") == "flashflow_catalog":
            score += 5  # Known products

        p["score"] = score

    # Deduplicate by name similarity
    seen_names = set()
    unique = []
    for p in sorted(products, key=lambda x: x["score"], reverse=True):
        name_key = p["name"].lower()[:30]
        if name_key not in seen_names:
            seen_names.add(name_key)
            unique.append(p)

    selected = unique[:config.get("max_products", 5)]
    log.info(f"  Selected {len(selected)} products for generation")
    for p in selected:
        log.info(f"    - {p['name'][:60]} (score: {p['score']})")

    return selected


def step3_generate(products: list[dict], config: dict, dry_run: bool = False) -> list[dict]:
    """Generate scripts for selected products."""
    log.info("Step 3: Generating scripts...")
    scripts = []
    scripts_per = config.get("scripts_per_product", 3)

    for product in products:
        product_id = product.get("id")
        if not product_id:
            log.info(f"  Skipping '{product['name'][:40]}' — no FlashFlow product ID")
            continue

        for i in range(scripts_per):
            content_type = CONTENT_TYPES[i % len(CONTENT_TYPES)]
            log.info(f"  Generating {content_type} for {product['name'][:40]}...")

            if dry_run:
                scripts.append({
                    "product": product,
                    "content_type": content_type,
                    "hook": f"[DRY RUN] Hook for {product['name']}",
                    "script": "[DRY RUN] Script content",
                    "ai_score": 0,
                    "local_score": 0,
                })
                continue

            r = api_call("POST", "/ai/generate-content", {
                "product_id": product_id,
                "content_type": content_type,
            })

            if r["ok"]:
                data = r["data"].get("data", {})
                skit_data = data.get("skit_data") or data.get("script") or {}
                hook = ""
                script_text = ""

                if isinstance(skit_data, dict):
                    hook = skit_data.get("hook", {}).get("line", "") if isinstance(skit_data.get("hook"), dict) else str(skit_data.get("hook", ""))
                    beats = skit_data.get("beats", [])
                    script_text = hook + "\n" + "\n".join(
                        b.get("dialogue", b.get("action", "")) for b in beats if isinstance(b, dict)
                    )
                elif isinstance(skit_data, str):
                    script_text = skit_data
                    hook = skit_data.split("\n")[0] if skit_data else ""

                ai_score = 0
                score_data = data.get("ai_score") or data.get("score") or {}
                if isinstance(score_data, dict):
                    ai_score = score_data.get("overall_score", 0)
                elif isinstance(score_data, (int, float)):
                    ai_score = score_data

                scripts.append({
                    "product": product,
                    "content_type": content_type,
                    "hook": hook[:200],
                    "script": script_text[:2000],
                    "skit_data": skit_data,
                    "ai_score": ai_score,
                    "local_score": 0,
                    "generation_data": data,
                })
                log.info(f"    Hook: {hook[:80]}")
                log.info(f"    AI Score: {ai_score}")
            else:
                log.warning(f"    Generation failed: {r.get('error', r.get('data', {}))}")

            time.sleep(2)  # Rate limit

    log.info(f"  Generated {len(scripts)} scripts total")
    return scripts


def step4_score(scripts: list[dict], config: dict) -> list[dict]:
    """Score scripts using local LLM."""
    log.info("Step 4: Scoring scripts with local LLM...")

    if not config.get("use_local_llm", True):
        log.info("  Local LLM scoring disabled, using AI scores only")
        for s in scripts:
            s["local_score"] = s["ai_score"]
        return scripts

    for s in scripts:
        if not s["hook"] or s["hook"].startswith("[DRY RUN]"):
            continue

        prompt = f"""Rate this TikTok video script on a scale of 1-10 for viral potential.

Hook: {s['hook']}

Full script:
{s['script'][:500]}

Consider:
- Does the hook stop scrolling in 1-3 seconds?
- Is there a clear pattern interrupt?
- Is the CTA clear?
- Would this work on TikTok?

Respond with ONLY a number 1-10, nothing else."""

        response = lm_studio_generate(prompt, max_tokens=10, temperature=0.3)
        # Extract number from response
        numbers = re.findall(r'\b(\d+)\b', response)
        if numbers:
            score = min(int(numbers[0]), 10)
            s["local_score"] = score
            log.info(f"    '{s['hook'][:50]}...' → LLM score: {score}")
        else:
            s["local_score"] = s["ai_score"]  # Fallback
            log.warning(f"    Could not parse LLM score: '{response[:50]}'")

    return scripts


def step5_queue(scripts: list[dict], config: dict, dry_run: bool = False) -> list[dict]:
    """Queue high-scoring scripts to FlashFlow pipeline."""
    log.info("Step 5: Queuing high-scoring scripts...")
    min_score = config.get("min_score", 7)
    queued = []

    for s in scripts:
        best_score = max(s["ai_score"], s["local_score"])
        if best_score < min_score:
            log.info(f"  Skip: '{s['hook'][:40]}' (score {best_score} < {min_score})")
            continue

        if dry_run:
            queued.append(s)
            log.info(f"  [DRY RUN] Would queue: '{s['hook'][:40]}' (score {best_score})")
            continue

        # Save to skit library
        product = s["product"]
        r = api_call("POST", "/skits", {
            "title": s["hook"][:100] or f"Generated: {product['name'][:50]}",
            "status": "approved",
            "product_id": product.get("id"),
            "skit_data": s.get("skit_data", {}),
            "ai_score": s.get("generation_data", {}).get("ai_score"),
        })

        if r["ok"]:
            skit_id = r["data"].get("data", {}).get("id")
            log.info(f"  Saved to library: {skit_id}")

            # Auto-add to winners bank if score 8+
            if best_score >= 8:
                api_call("POST", "/winners", {
                    "source_type": "generated",
                    "hook": s["hook"][:200],
                    "full_script": s["script"][:2000],
                    "content_format": s["content_type"],
                    "notes": f"Auto-generated (score: {best_score}/10)",
                })
                log.info(f"  Added to Winners Bank (score {best_score})")

            queued.append(s)
        else:
            log.warning(f"  Failed to save: {r.get('error', r.get('data', {}))}")

    log.info(f"  Queued {len(queued)} scripts (min score: {min_score})")
    return queued


def step6_briefs(queued: list[dict]):
    """Generate VA briefs for queued scripts."""
    log.info("Step 6: Generating VA briefs...")

    for s in queued:
        product = s["product"]
        brief = f"""VIDEO EDITING BRIEF
{'='*40}
Product: {product.get('name', 'Unknown')}
Brand: {product.get('brand', 'Unknown')}
Content Type: {s['content_type']}
Score: {max(s['ai_score'], s['local_score'])}/10

HOOK (first 1-3 seconds):
{s['hook']}

SCRIPT:
{s['script'][:1000]}

EDITING NOTES:
- Style: Fast cuts for hooks, smooth for product shots
- Text: Bold, readable on mobile, high contrast
- Music: Trending sound or upbeat
- Duration: 15-30 seconds
- Aspect: 9:16 (vertical)

QUALITY CHECKLIST:
[ ] Hook grabs attention in 1-3 seconds
[ ] Text readable on mobile
[ ] Audio clean
[ ] Product clearly visible
[ ] CTA present and clear
[ ] 9:16 aspect ratio
"""
        log.info(f"  Brief for: {product.get('name', '')[:40]}")
        # Briefs are logged — in production, would save to Drive or send to VA

    return len(queued)


def step7_report(products: list[dict], scripts: list[dict], queued: list[dict]):
    """Generate pipeline run report."""
    log.info("Step 7: Generating report...")
    JOURNALS_DIR.mkdir(parents=True, exist_ok=True)

    today = datetime.now().strftime("%Y-%m-%d")
    report_path = JOURNALS_DIR / f"{today}-content-pipeline.md"

    lines = [
        f"# Content Pipeline Report — {today}",
        f"**Run at:** {datetime.now().strftime('%H:%M:%S')}",
        f"",
        f"## Summary",
        f"- Products evaluated: {len(products)}",
        f"- Scripts generated: {len(scripts)}",
        f"- Scripts queued (score 7+): {len(queued)}",
        f"- Scripts to Winners Bank (score 8+): {sum(1 for s in queued if max(s['ai_score'], s['local_score']) >= 8)}",
        f"",
        f"## Scripts Generated",
    ]

    for s in scripts:
        score = max(s['ai_score'], s['local_score'])
        status = "QUEUED" if s in queued else "SKIPPED"
        lines.append(f"- [{status}] {s['product']['name'][:40]} ({s['content_type']}) — score: {score}")
        lines.append(f"  Hook: {s['hook'][:80]}")

    lines.append(f"")
    lines.append(f"## Products Considered")
    for p in products:
        lines.append(f"- {p['name'][:60]} (source: {p.get('source', 'unknown')}, score: {p.get('score', 0)})")

    report = "\n".join(lines)
    with open(report_path, "w") as f:
        f.write(report)

    log.info(f"  Report saved to {report_path}")
    return report_path


def main():
    JOURNALS_DIR.mkdir(parents=True, exist_ok=True)
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)

    config = load_config()
    dry_run = "--dry-run" in sys.argv
    scripts_only = "--scripts-only" in sys.argv

    # Check for specific product
    target_product = None
    if "--product" in sys.argv:
        idx = sys.argv.index("--product")
        if idx + 1 < len(sys.argv):
            target_product = sys.argv[idx + 1]

    log.info(f"{'='*60}")
    log.info(f"  FlashFlow Content Pipeline")
    log.info(f"  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    if dry_run:
        log.info(f"  MODE: DRY RUN")
    log.info(f"{'='*60}")

    if not API_KEY:
        log.error("No FlashFlow API key found. Set FLASHFLOW_API_KEY or check OpenClaw config.")
        sys.exit(1)

    # Step 1: Research
    if scripts_only or target_product:
        products = []
        if target_product:
            r = api_call("GET", "/products")
            if r["ok"]:
                for p in r["data"].get("data", []):
                    if target_product.lower() in p.get("name", "").lower():
                        products.append({
                            "id": p["id"],
                            "name": p["name"],
                            "brand": p.get("brand", ""),
                            "source": "manual",
                            "score": 20,
                        })
            if not products:
                log.error(f"Product '{target_product}' not found in FlashFlow")
                sys.exit(1)
    else:
        products = step1_research()

    # Step 2: Select
    selected = step2_select(products, config)
    if not selected:
        log.info("No products to generate content for. Exiting.")
        return

    # Step 3: Generate
    scripts = step3_generate(selected, config, dry_run)

    # Step 4: Score
    scripts = step4_score(scripts, config)

    # Step 5: Queue
    queued = step5_queue(scripts, config, dry_run)

    # Step 6: Briefs
    step6_briefs(queued)

    # Step 7: Report
    step7_report(selected, scripts, queued)

    log.info(f"\nPipeline complete. {len(queued)}/{len(scripts)} scripts queued.")


if __name__ == "__main__":
    main()
