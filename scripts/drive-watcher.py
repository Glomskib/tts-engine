#!/usr/bin/env python3
"""
Google Drive File Watcher for FlashFlow Pipeline

Monitors a "NEEDS EDITED" Google Drive folder every 30 minutes.
When new video files are detected:
  - Parses folder path for brand/product names
  - Creates a FlashFlow pipeline entry via API
  - Logs all actions

Folder structure expected:
  NEEDS EDITED/
    BrandName/
      ProductName/
        video-file.mp4
    Unassigned/
      video-file.mp4   → creates entry with status NEEDS_SCRIPT

Usage:
  python drive-watcher.py              # Run once
  python drive-watcher.py --daemon     # Run every 30 minutes
"""

import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

# --- Configuration ---

CONFIG_PATH = Path(__file__).parent / "drive-watcher-config.json"
STATE_PATH = Path(__file__).parent / ".drive-watcher-state.json"
LOG_DIR = Path.home() / ".openclaw" / "workspace" / "second-brain" / "journals"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "drive-watcher.log", mode="a"),
    ],
)
log = logging.getLogger("drive-watcher")


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log.error(f"Config not found at {CONFIG_PATH}. Copy drive-watcher-config.example.json and fill in values.")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        return json.load(f)


def load_state() -> dict:
    if STATE_PATH.exists():
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"seen_file_ids": []}


def save_state(state: dict):
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def get_drive_service(config: dict):
    """Build Google Drive API service using service account credentials."""
    creds_path = config.get("google_credentials_path")
    if not creds_path or not Path(creds_path).exists():
        log.error(f"Google credentials file not found: {creds_path}")
        sys.exit(1)

    creds = Credentials.from_service_account_file(
        creds_path,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=creds)


def list_files_recursive(service, folder_id: str, path_parts: list[str] = None) -> list[dict]:
    """Recursively list all files in a folder, tracking the path."""
    if path_parts is None:
        path_parts = []

    results = []
    query = f"'{folder_id}' in parents and trashed = false"
    page_token = None

    while True:
        resp = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name, mimeType, createdTime, size)",
            pageSize=100,
            pageToken=page_token,
        ).execute()

        for item in resp.get("files", []):
            if item["mimeType"] == "application/vnd.google-apps.folder":
                # Recurse into subfolder
                sub_results = list_files_recursive(
                    service, item["id"], path_parts + [item["name"]]
                )
                results.extend(sub_results)
            else:
                # It's a file — check if it's a video
                name_lower = item["name"].lower()
                if any(name_lower.endswith(ext) for ext in [".mp4", ".mov", ".avi", ".mkv", ".webm"]):
                    results.append({
                        "id": item["id"],
                        "name": item["name"],
                        "path_parts": path_parts,
                        "created_time": item.get("createdTime"),
                        "size": item.get("size"),
                    })

        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return results


def parse_brand_product(path_parts: list[str]) -> tuple[str | None, str | None, str]:
    """
    Parse folder path to extract brand and product names.

    Expected structures:
      [BrandName, ProductName] → brand=BrandName, product=ProductName, status=assigned
      [Unassigned] → brand=None, product=None, status=needs_script
      [] → brand=None, product=None, status=needs_script
    """
    if not path_parts:
        return None, None, "needs_script"

    if path_parts[0].lower() == "unassigned":
        return None, None, "needs_script"

    brand = path_parts[0] if len(path_parts) >= 1 else None
    product = path_parts[1] if len(path_parts) >= 2 else None
    return brand, product, "assigned"


def create_pipeline_entry(config: dict, file_info: dict, brand: str | None, product: str | None, status: str):
    """POST to FlashFlow API to create a pipeline entry."""
    api_url = config["flashflow_api_url"].rstrip("/")
    api_key = config["flashflow_api_key"]

    payload = {
        "title": file_info["name"],
        "status": status,
        "source": "drive-watcher",
        "notes": f"Auto-imported from Google Drive. Path: {'/'.join(file_info['path_parts'])}",
    }

    if brand:
        payload["brand_name"] = brand
    if product:
        payload["product_name"] = product

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
            log.info(f"Created pipeline entry for '{file_info['name']}' (status={status}, brand={brand}, product={product})")
            return True
        else:
            log.warning(f"API returned error for '{file_info['name']}': {data}")
            return False
    except Exception as e:
        log.error(f"Failed to create pipeline entry for '{file_info['name']}': {e}")
        return False


def run_once(config: dict):
    """Single scan of the Google Drive folder."""
    state = load_state()
    seen_ids = set(state.get("seen_file_ids", []))

    service = get_drive_service(config)
    folder_id = config["watch_folder_id"]

    log.info(f"Scanning Google Drive folder {folder_id}...")
    files = list_files_recursive(service, folder_id)
    log.info(f"Found {len(files)} video files total, {len(seen_ids)} previously seen")

    new_count = 0
    for f in files:
        if f["id"] in seen_ids:
            continue

        brand, product, status = parse_brand_product(f["path_parts"])
        success = create_pipeline_entry(config, f, brand, product, status)

        if success:
            seen_ids.add(f["id"])
            new_count += 1

    # Save state
    state["seen_file_ids"] = list(seen_ids)
    state["last_scan"] = datetime.utcnow().isoformat()
    state["last_scan_new_files"] = new_count
    save_state(state)

    log.info(f"Scan complete. {new_count} new files processed.")
    return new_count


def main():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config()

    if "--daemon" in sys.argv:
        interval = config.get("poll_interval_minutes", 30) * 60
        log.info(f"Starting daemon mode. Polling every {interval // 60} minutes.")
        while True:
            try:
                run_once(config)
            except Exception as e:
                log.error(f"Scan failed: {e}")
            time.sleep(interval)
    else:
        run_once(config)


if __name__ == "__main__":
    main()
