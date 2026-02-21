#!/usr/bin/env tsx
/**
 * Publisher — generates an Upload Pack and writes files to disk.
 *
 * Usage:
 *   pnpm run publish:pack -- --video-id <uuid>
 *   pnpm run publish:pack -- --video-id <uuid> --dry-run
 *   pnpm run publish:pack -- --video-id <uuid> --api-url http://localhost:3000
 *   pnpm run publish:pack -- --video-id <uuid> --token <jwt>
 *
 * Output: ~/FlashFlowUploads/YYYY-MM-DD/<lane>/<slug>/
 *   caption.txt, hashtags.txt, cover.txt, hook.txt, cta.txt,
 *   checklist.md, metadata.json, video.mp4
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import type { UploadPack } from "../lib/publish/upload-pack";

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  function getArg(name: string): string | undefined {
    const idx = args.indexOf(name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
  }

  const videoId = getArg("--video-id");
  const apiUrl = getArg("--api-url") || process.env.FF_API_URL || "http://localhost:3000";
  const token = getArg("--token") || process.env.FF_API_TOKEN;

  return { videoId, apiUrl, dryRun, token };
}

async function fetchUploadPack(
  apiUrl: string,
  videoId: string,
  token: string | undefined
): Promise<{ pack: UploadPack; mc_doc_id: string | null }> {
  const url = `${apiUrl}/api/publish/upload-pack`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ video_id: videoId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(`API returned ok=false: ${JSON.stringify(json)}`);
  }

  return json.data;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) return reject(new Error("Redirect with no location"));
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Download failed: HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function buildChecklist(pack: UploadPack): string {
  return [
    "# TikTok Upload Checklist",
    "",
    `**Product:** ${pack.product_name}`,
    `**Lane:** ${pack.lane}`,
    `**Video ID:** ${pack.video_id}`,
    "",
    "## Pre-Upload",
    "- [ ] Watch the video fully",
    "- [ ] Verify audio is clean",
    "- [ ] Check cover text matches hook",
    "",
    "## Upload Steps",
    "1. Open TikTok > tap **+** > **Upload**",
    "2. Select `video.mp4` from this folder",
    "3. Paste caption from `caption.txt`",
    "4. Add hashtags from `hashtags.txt`",
    "5. Set cover text from `cover.txt` (if using text overlay)",
    "6. Enable **TikTok Shop** link if applicable",
    "7. Post!",
    "",
    "## Post-Upload",
    "- [ ] Copy the TikTok URL",
    "- [ ] Run: `curl -X POST .../api/videos/<id>/mark-posted -d '{\"posted_url\":\"<url>\"}'`",
    "- [ ] Confirm video appears on account",
    "",
    `## Compliance`,
    `- ${pack.compliance_notes}`,
    "",
  ].join("\n");
}

async function main() {
  const { videoId, apiUrl, dryRun, token } = parseArgs();

  if (!videoId) {
    console.error("[publisher] ERROR: --video-id is required");
    console.error("Usage: tsx scripts/publisher.ts --video-id <uuid>");
    process.exit(1);
  }

  console.log(`[publisher] Video ID: ${videoId}`);
  console.log(`[publisher] API URL:  ${apiUrl}`);
  console.log(`[publisher] Dry run:  ${dryRun}`);

  // Fetch upload pack from API
  console.log("[publisher] Fetching upload pack...");
  const { pack, mc_doc_id } = await fetchUploadPack(apiUrl, videoId, token);
  console.log(`[publisher] Pack generated for "${pack.product_name}" (${pack.lane})`);

  if (mc_doc_id) {
    console.log(`[publisher] Mission Control doc: ${mc_doc_id}`);
  }

  if (dryRun) {
    console.log("\n[publisher] DRY RUN — pack contents:");
    console.log(JSON.stringify(pack, null, 2));
    process.exit(0);
  }

  // Create output directory: ~/FlashFlowUploads/YYYY-MM-DD/<lane>/<slug>/
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(pack.product_name);
  const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
  const outDir = path.join(homeDir, "FlashFlowUploads", today, pack.lane, slug);

  fs.mkdirSync(outDir, { recursive: true });
  console.log(`[publisher] Output: ${outDir}`);

  // Write text files
  fs.writeFileSync(path.join(outDir, "caption.txt"), pack.caption, "utf-8");
  fs.writeFileSync(path.join(outDir, "hashtags.txt"), pack.hashtags.join(" "), "utf-8");
  fs.writeFileSync(path.join(outDir, "cover.txt"), pack.cover_text, "utf-8");
  fs.writeFileSync(path.join(outDir, "hook.txt"), pack.hook, "utf-8");
  fs.writeFileSync(path.join(outDir, "cta.txt"), pack.cta, "utf-8");
  fs.writeFileSync(path.join(outDir, "checklist.md"), buildChecklist(pack), "utf-8");
  fs.writeFileSync(path.join(outDir, "metadata.json"), JSON.stringify(pack, null, 2), "utf-8");

  console.log("[publisher] Text files written");

  // Download video
  if (pack.video_url) {
    console.log("[publisher] Downloading video...");
    const videoPath = path.join(outDir, "video.mp4");
    await downloadFile(pack.video_url, videoPath);
    const stat = fs.statSync(videoPath);
    console.log(`[publisher] Video downloaded (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.warn("[publisher] No video URL — skipping download");
  }

  console.log(`\n[publisher] Done! Upload pack ready at:\n  ${outDir}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[publisher] Fatal error:", err);
  process.exit(1);
});
