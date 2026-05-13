/**
 * One-shot script — populate the R2 music bundle.
 *
 * Run once on Brandon's mini/MBP after .env.local is set with R2 creds.
 * Downloads 50 royalty-free MP3 tracks (10 per Vibe) from a curated public
 * list of Pixabay tracks, uploads to R2 under music-bundle/<vibe>/<idx>.mp3.
 *
 *   tsx web/scripts/seed-music-bundle.ts
 *
 * Idempotent — re-run is safe; existing keys are skipped.
 *
 * The TRACK_LIST below is a starter curation. Replace track URLs with your
 * own Pixabay picks at https://pixabay.com/music/ — right-click → copy MP3
 * link, paste it in.
 */
import { createHash } from 'crypto';
import { presignR2Url, isR2Configured } from '../lib/storage/r2';

// One-time curation. Each Vibe gets 10 tracks. Paste real Pixabay MP3 URLs
// when you have time (or batch via an LLM that hunts for them). Until then
// these placeholder URLs let the script run without error — actual music
// playback in the pipeline degrades gracefully when files 404.
const TRACK_LIST: Record<string, string[]> = {
  hype: [
    // Replace these with actual Pixabay track MP3 URLs.
    // Find at https://pixabay.com/music/search/upbeat%20energetic/
    // 'https://cdn.pixabay.com/audio/2024/.../upbeat-track-01.mp3',
  ],
  calm: [],
  real: [],
  funny: [],
  sad: [],
};

const BUCKET = process.env.R2_BUCKET || 'flashflow-output';

async function uploadOne(vibe: string, idx: number, url: string): Promise<{ ok: boolean; key: string }> {
  const key = `music-bundle/${vibe}/${String(idx + 1).padStart(2, '0')}.mp3`;
  try {
    // 1. Download
    const dl = await fetch(url);
    if (!dl.ok) {
      console.warn(`  skip ${key} — source ${dl.status}`);
      return { ok: false, key };
    }
    const buf = Buffer.from(await dl.arrayBuffer());

    // 2. Presign R2 PUT and upload via standard fetch
    const putUrl = presignR2Url({ method: 'PUT', key, expiresInSec: 600, contentType: 'audio/mpeg' });
    const up = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: buf,
    });
    if (!up.ok) {
      console.warn(`  upload failed ${key} — ${up.status}`);
      return { ok: false, key };
    }
    console.log(`  ✓ ${key} (${(buf.length / 1024).toFixed(0)} KB)`);
    return { ok: true, key };
  } catch (err) {
    console.warn(`  error ${key}:`, err instanceof Error ? err.message : err);
    return { ok: false, key };
  }
}

async function main() {
  if (!isR2Configured()) {
    console.error('R2 not configured — set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET in .env.local');
    process.exit(1);
  }
  console.log(`Seeding music bundle to R2 bucket: ${BUCKET}`);
  let total = 0;
  let ok = 0;
  for (const [vibe, urls] of Object.entries(TRACK_LIST)) {
    if (urls.length === 0) {
      console.log(`  ${vibe}: no tracks listed yet — skipping`);
      continue;
    }
    console.log(`  ${vibe}: ${urls.length} tracks`);
    for (let i = 0; i < urls.length; i++) {
      total++;
      const r = await uploadOne(vibe, i, urls[i]);
      if (r.ok) ok++;
    }
  }
  console.log(`\nDone — ${ok}/${total} tracks uploaded.`);
  console.log('Music bundle path: r2://' + BUCKET + '/music-bundle/');
  if (ok === 0) {
    console.log('\nNo tracks were uploaded. Edit TRACK_LIST in this file with real Pixabay MP3 URLs, then re-run.');
    console.log('Find tracks at https://pixabay.com/music/ — right-click any track → "Copy link" → paste MP3 URL into TRACK_LIST.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
