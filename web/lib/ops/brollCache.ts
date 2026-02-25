/**
 * B-Roll File System Cache
 *
 * Manages a local SSD cache of b-roll assets for fast editor access.
 * Writes metadata to Supabase (broll_assets table) and files to
 * /Volumes/WorkSSD/broll-cache/{client_id}/{script_id}/
 *
 * Prepares for Bolt automation — no UI dependencies.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import fs from "fs/promises";
import path from "path";

// ── Config ─────────────────────────────────────────────────

const CACHE_ROOT = "/Volumes/WorkSSD/broll-cache";

// ── Types ──────────────────────────────────────────────────

export interface BrollCacheEntry {
  client_id: string;
  script_id: string;
  filename: string;
  local_path: string;
  size_bytes: number;
  cached_at: string;
}

export interface CacheWriteResult {
  ok: boolean;
  local_path: string;
  db_updated: boolean;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────

function getCachePath(clientId: string, scriptId: string): string {
  return path.join(CACHE_ROOT, clientId, scriptId);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// ── Core logic ─────────────────────────────────────────────

/**
 * Write a b-roll file to the local SSD cache and update Supabase metadata.
 *
 * @param clientId  - The client who owns this asset
 * @param scriptId  - The script this b-roll is for
 * @param filename  - Original filename (e.g. "sunset-timelapse.mp4")
 * @param data      - Raw file buffer
 * @param brollAssetId - Optional: existing broll_assets row ID to update
 */
export async function writeBrollCache(
  clientId: string,
  scriptId: string,
  filename: string,
  data: Buffer,
  brollAssetId?: string,
): Promise<CacheWriteResult> {
  const dir = getCachePath(clientId, scriptId);
  const filePath = path.join(dir, filename);

  try {
    // Write to local SSD
    await ensureDir(dir);
    await fs.writeFile(filePath, data);

    // Update Supabase metadata (if asset ID provided)
    let dbUpdated = false;
    if (brollAssetId) {
      const { error } = await supabaseAdmin
        .from("broll_assets")
        .update({
          local_cached: true,
          local_path: filePath,
        })
        .eq("id", brollAssetId);

      dbUpdated = !error;
      if (error) {
        console.error("[brollCache] DB update failed:", error.message);
      }
    }

    return { ok: true, local_path: filePath, db_updated: dbUpdated };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown write error";
    return { ok: false, local_path: filePath, db_updated: false, error: message };
  }
}

/**
 * Check if a b-roll file exists in the local cache.
 */
export async function isCached(
  clientId: string,
  scriptId: string,
  filename: string,
): Promise<boolean> {
  const filePath = path.join(getCachePath(clientId, scriptId), filename);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all cached files for a given client + script.
 */
export async function listCachedFiles(
  clientId: string,
  scriptId: string,
): Promise<BrollCacheEntry[]> {
  const dir = getCachePath(clientId, scriptId);
  try {
    const files = await fs.readdir(dir);
    const entries: BrollCacheEntry[] = [];

    for (const filename of files) {
      const filePath = path.join(dir, filename);
      const stat = await fs.stat(filePath);
      entries.push({
        client_id: clientId,
        script_id: scriptId,
        filename,
        local_path: filePath,
        size_bytes: stat.size,
        cached_at: stat.mtime.toISOString(),
      });
    }

    return entries;
  } catch {
    return []; // Directory doesn't exist yet
  }
}

/**
 * Purge cached files for a script (e.g. after job completion).
 */
export async function purgeCacheForScript(
  clientId: string,
  scriptId: string,
): Promise<{ purged: number }> {
  const dir = getCachePath(clientId, scriptId);
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      await fs.unlink(path.join(dir, f));
    }
    await fs.rmdir(dir);
    return { purged: files.length };
  } catch {
    return { purged: 0 };
  }
}
