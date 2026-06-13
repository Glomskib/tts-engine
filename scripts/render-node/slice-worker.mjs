// FlashFlow Mac-mini slice-render worker (EDITOR).
// Claims `clip_render` jobs from ff_render_jobs and produces an EDITED 9:16 short:
//   trim to [start,end] -> scale/pad 1080x1920 -> BURN speech-timed captions in
//   the user's chosen style -> audio loudnorm + fades -> upload to `renders`.
// Reuses render-node/.env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
// Run on the mini:  pm2 start slice-worker.mjs --name ff-slice-worker
import 'dotenv/config';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const execFileAsync = promisify(execFile);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RENDERS_BUCKET = 'renders';
const POLL_MS = 4000;
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('[slice-worker] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function ffmpegPath() {
  // Prefer ffmpeg-static — the mini's /opt/homebrew ffmpeg is a stripped build
  // with NO libass/libfreetype (no caption filters). ffmpeg-static is a full
  // static build that has them.
  try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) return p; } catch {}
  for (const c of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) if (fs.existsSync(c)) return c;
  try { const p = execSync('command -v ffmpeg', { encoding: 'utf8' }).trim(); if (p) return p; } catch {}
  return 'ffmpeg';
}
const FFMPEG = ffmpegPath();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Head+tail truncation for error columns. execFile errors start with the
// giant ffmpeg command line, so a plain .slice(0, N) burns the whole budget
// on the command and the actual stderr (which ffmpeg prints LAST) never
// reaches the DB. Keep a little head for context + the tail where the
// real error lives.
function trimErr(msg, head, tail) {
  const s = String(msg == null ? '' : msg);
  return s.length <= head + tail + 3 ? s : `${s.slice(0, head)} … ${s.slice(-tail)}`;
}

// ─── Captions ────────────────────────────────────────────────────────────────
function captionStyle(name) {
  // ASS colours are &HAABBGGRR. Yellow=&H0000FFFF, White=&H00FFFFFF, Black=&H00000000.
  const base = { font: 'Arial', size: 92, primary: '&H0000FFFF', outline: '&H00000000', bold: 1, outlineW: 5, shadow: 2, marginV: 430, upper: true, maxWords: 4 };
  switch (String(name || '').toLowerCase()) {
    case 'subtle_white': case 'two_line_news': return { ...base, primary: '&H00FFFFFF', size: 76, outlineW: 3, upper: false, maxWords: 5 };
    case 'mrbeast_big': return { ...base, primary: '&H00FFFFFF', size: 122, outlineW: 10, shadow: 4, marginV: 480, maxWords: 3 };
    case 'slow_reader': return { ...base, primary: '&H00FFFFFF', size: 86, outlineW: 4, upper: false, maxWords: 3 };
    case 'karaoke': case 'bold_yellow': default: return base;
  }
}
function assTime(t) { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60); return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; }
function assEscape(x) { return String(x).replace(/[{}\\]/g, '').replace(/\r?\n/g, ' ').trim(); }

async function fetchCaptionEvents(runId, startSec, endSec, st) {
  const { data: chunks } = await sb.from('ve_transcript_chunks')
    .select('start_sec,end_sec,text,idx').eq('run_id', runId).order('idx', { ascending: true });
  if (!chunks || !chunks.length) return [];
  const events = [];
  for (const c of chunks) {
    const cs = Number(c.start_sec), ce = Number(c.end_sec);
    if (!(ce > startSec && cs < endSec)) continue; // no overlap with clip window
    const ws = Math.max(cs, startSec) - startSec;   // clip-relative
    const we = Math.min(ce, endSec) - startSec;
    const text = String(c.text || '').trim();
    if (!text || we <= ws) continue;
    const words = text.split(/\s+/).filter(Boolean);
    const groups = [];
    for (let i = 0; i < words.length; i += st.maxWords) groups.push(words.slice(i, i + st.maxWords).join(' '));
    if (!groups.length) continue;
    const dur = (we - ws) / groups.length;
    groups.forEach((g, gi) => events.push({ start: ws + gi * dur, end: ws + (gi + 1) * dur, text: st.upper ? g.toUpperCase() : g }));
  }
  return events;
}
function buildAss(events, st) {
  const head =
`[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${st.font},${st.size},${st.primary},&H000000FF,${st.outline},&H64000000,${st.bold},0,0,0,100,100,0,0,1,${st.outlineW},${st.shadow},2,70,70,${st.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = events.map((e) => `Dialogue: 0,${assTime(e.start)},${assTime(e.end)},Cap,,0,0,0,,${assEscape(e.text)}`).join('\n');
  return head + lines + '\n';
}

// ─── Link ingest (yt-dlp) ─────────────────────────────────────────────────────
function ytdlpPath() {
  for (const c of ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp']) if (fs.existsSync(c)) return c;
  try { const p = execSync('command -v yt-dlp', { encoding: 'utf8' }).trim(); if (p) return p; } catch {}
  return 'yt-dlp';
}
// Instagram (and occasionally Facebook) login-wall anonymous downloads. yt-dlp
// can ride a real session if a Netscape-format cookies file is present — drop
// one at ~/.flashflow/yt-dlp-cookies.txt on the mini (export with a "Get
// cookies.txt" browser extension while logged into instagram.com), or point
// YTDLP_COOKIES at a custom path. No file = anonymous best-effort, which is
// the approved support level for Instagram (FB public videos work without it).
function ytdlpCookieArgs() {
  const cookieFile = process.env.YTDLP_COOKIES || path.join(os.homedir(), '.flashflow', 'yt-dlp-cookies.txt');
  return fs.existsSync(cookieFile) ? ['--cookies', cookieFile] : [];
}
// Download link-source videos (TikTok/YouTube/Facebook/Instagram/etc) into
// clip-sources so the pipeline can transcribe + clip them. Vercel can't run
// yt-dlp; the mini can. yt-dlp's extractors handle the per-platform parsing,
// so no URL whitelist here — the web app gates what links it accepts.
async function ingestLinks() {
  const { data: assets } = await sb.from('ve_assets')
    .select('id,run_id,user_id,storage_path,metadata')
    .like('storage_path', 'link/%')
    .limit(3);
  const a = (assets || []).find((x) => x?.metadata?.source_kind === 'link' && !x?.metadata?.ingested && !x?.metadata?.ingesting);
  if (!a) return;
  const url = a.metadata?.original_url;
  if (!url) return;
  // optimistic lock so a second worker doesn't double-ingest
  await sb.from('ve_assets').update({ metadata: { ...a.metadata, ingesting: true } }).eq('id', a.id);
  const tmp = path.join(os.tmpdir(), `ingest-${a.run_id}.mp4`);
  console.log(`[slice-worker] ingesting link run=${a.run_id} ${url}`);
  try {
    const YTDLP = ytdlpPath();
    // Args stay platform-generic: mp4-first format ladder, 600M cap (plenty
    // for FB/IG reels — those are typically <100M even in HD), 3 retries.
    await execFileAsync(YTDLP, [
      '-f', 'b[ext=mp4]/bv*[ext=mp4]+ba/b', '--no-playlist', '--no-warnings',
      '--max-filesize', '600M', '--retries', '3', ...ytdlpCookieArgs(), '-o', tmp, url,
    ], { timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 1024) throw new Error('yt-dlp produced no file');
    const key = `ve-ingest/${a.user_id}/${a.run_id}.mp4`;
    const up = await sb.storage.from('clip-sources').upload(key, fs.readFileSync(tmp), { contentType: 'video/mp4', upsert: true });
    if (up.error) throw new Error('ingest upload: ' + up.error.message);
    const { data: signed } = await sb.storage.from('clip-sources').createSignedUrl(key, 60 * 60 * 24);
    await sb.from('ve_assets').update({
      storage_bucket: 'clip-sources', storage_path: key, storage_url: signed?.signedUrl || null,
      metadata: { ...a.metadata, ingested: true, ingesting: false },
    }).eq('id', a.id);
    console.log(`[slice-worker] ingested link run=${a.run_id} -> ${key} (${fs.statSync(tmp).size}B)`);
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    console.error(`[slice-worker] link ingest FAIL run=${a.run_id}: ${msg}`);
    // Instagram is best-effort beta — Meta blocks anonymous yt-dlp often, so
    // surface the honest "upload it instead" copy instead of a raw yt-dlp error.
    const friendly = /instagram\.com|instagr\.am/i.test(String(url))
      ? 'Instagram blocked this one — it happens. Download the video and upload it directly instead.'
      : ('Could not download that link: ' + msg).slice(0, 200);
    await sb.from('ve_assets').update({ metadata: { ...a.metadata, ingested: true, ingesting: false, ingest_error: msg.slice(0, 300) } }).eq('id', a.id);
    await sb.from('ve_runs').update({ status: 'failed', error_message: friendly }).eq('id', a.run_id);
  } finally { try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch {} }
}

// ─── Worker ──────────────────────────────────────────────────────────────────
async function registerWorker() {
  const hostname = `${os.hostname()}-slice`;
  let ffver = 'unknown';
  try { ffver = execSync(`${FFMPEG} -version`, { encoding: 'utf8' }).split('\n')[0].split(' ')[2] || 'unknown'; } catch {}
  const { data, error } = await sb.from('ff_render_workers').upsert({
    hostname, status: 'online', last_heartbeat_at: new Date().toISOString(),
    ffmpeg_version: ffver, cpu_brand: os.cpus()[0]?.model || null, os_version: `${os.platform()} ${os.release()}`, concurrency_max: 2,
  }, { onConflict: 'hostname' }).select('id').single();
  if (error) throw new Error(`worker register failed: ${error.message}`);
  console.log(`[slice-worker] registered ${hostname} -> ${data.id}  ffmpeg=${FFMPEG} (${ffver})`);
  return data.id;
}

async function downloadSource(spec, dest) {
  // Prefer the (already-signed) source_url — uploads are stored in R2, which is
  // NOT a Supabase Storage bucket, so sb.storage.from(bucket) would 'Bucket not
  // found'. Fall back to the Supabase SDK only for real Supabase buckets.
  if (spec.source_url) {
    try { const r = await fetch(spec.source_url); if (r.ok) { fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return; } } catch (e) { console.warn('[slice-worker] source_url fetch failed:', e?.message || e); }
  }
  if (spec.source_bucket && spec.source_path) {
    const { data, error } = await sb.storage.from(spec.source_bucket).download(spec.source_path);
    if (!error && data) { fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer())); return; }
    throw new Error(`source download failed: ${error?.message || 'no data'}`);
  }
  throw new Error('no source_url or source_bucket/path in slice spec');
}

// Reaper: requeue clip_render jobs stuck in a claimed/rendering state (e.g. a
// worker crashed mid-render) back to pending so they get re-rendered. Bounded
// by attempts so a permanently-bad job eventually fails instead of looping.
async function reapStale() {
  const cutoff = new Date(Date.now() - 8 * 60 * 1000).toISOString();
  const { data: stale } = await sb.from('ff_render_jobs')
    .select('id,attempts,max_attempts')
    .eq('kind', 'clip_render')
    .in('status', ['claimed', 'rendering', 'uploading'])
    .lt('claimed_at', cutoff);
  for (const j of (stale || [])) {
    const dead = (j.attempts ?? 0) >= (j.max_attempts ?? 3);
    await sb.from('ff_render_jobs').update({
      status: dead ? 'failed' : 'pending',
      error: dead ? 'reaped: exceeded max attempts' : null,
      claimed_by: null, claimed_at: null, updated_at: new Date().toISOString(),
    }).eq('id', j.id);
    if (dead) await sb.from('ve_rendered_clips').update({ status: 'failed', error_message: 'render reaped (stuck worker)' }).eq('ff_render_job_id', j.id);
    console.log(`[slice-worker] reaped stale job ${j.id} -> ${dead ? 'failed' : 'pending'}`);
  }
}

async function renderJob(job) {
  const spec = typeof job.timeline === 'string' ? JSON.parse(job.timeline) : (job.timeline || {});
  const start = Math.max(0, Number(spec.start_sec) || 0);
  const end = Math.max(start + 0.5, Number(spec.end_sec) || start + 1);
  // 2026-06-10 retake fix: spec.keep_ranges = multi-range edit (flubbed takes
  // already subtracted by the pipeline). We cut those ranges and stitch them.
  const ranges = Array.isArray(spec.keep_ranges) && spec.keep_ranges.length
    ? spec.keep_ranges
        .map((r) => ({ s: Math.max(0, Number(r.start_sec) || 0), e: Math.max(0, Number(r.end_sec) || 0) }))
        .filter((r) => r.e - r.s >= 0.25)
        .sort((a, b) => a.s - b.s)
    : null;
  const len = ranges ? ranges.reduce((t, r) => t + (r.e - r.s), 0) : end - start;
  const work = crypto.randomUUID();
  const src = path.join(os.tmpdir(), `ff-src-${work}.mp4`);
  const out = path.join(os.tmpdir(), `ff-out-${work}.mp4`);
  const assName = `ffcap-${work}.ass`;
  const ass = path.join(os.tmpdir(), assName);
  const cleanup = [src, out, ass];
  try {
    await downloadSource(spec, src);

    // Build burned-in captions (speech-timed, user's style). Best-effort —
    // if the transcript is missing we still render a clean clip.
    let assFilter = '';
    try {
      const st = captionStyle(spec.caption_style);
      let events = [];
      if (ranges) {
        // Remap caption timing onto the stitched timeline: each range's cues
        // are offset by the total duration of the ranges before it.
        let offset = 0;
        for (const r of ranges) {
          const evs = await fetchCaptionEvents(spec.run_id, r.s, r.e, st);
          for (const ev of evs) events.push({ start: ev.start + offset, end: ev.end + offset, text: ev.text });
          offset += r.e - r.s;
        }
      } else {
        events = await fetchCaptionEvents(spec.run_id, start, end, st);
      }
      if (events.length) {
        fs.writeFileSync(ass, buildAss(events, st));
        // Explicit option name + single-quoted value. The bare positional form
        // (subtitles=ffcap-x.ass) relies on ffmpeg's shorthand option parsing,
        // which some builds reject inside filtergraphs with "No option name
        // near 'ffcap-…'" — that one-line parse error killed every captioned
        // render on 2026-06-11. filename='…' is parsed identically by every
        // ffmpeg (4.x–8.x) in -vf AND -filter_complex. assName is [a-z0-9-]
        // + ".ass" so no further escaping is needed inside the quotes.
        assFilter = `,subtitles=filename='${assName}'`; // libass; relative name + cwd=tmpdir
        console.log(`[slice-worker] captions: ${events.length} cues, style=${spec.caption_style}`);
      } else {
        console.log('[slice-worker] no caption events (no transcript chunks in window)');
      }
    } catch (e) { console.warn('[slice-worker] caption build failed (rendering without):', e?.message || e); }

    // 2026-06-10 audit fix — "B-roll never gets added": the slice spec now
    // carries music/broll picked by the Vercel pipeline (enable_broll /
    // enable_music). Download them best-effort; a dead URL never blocks the
    // render, it just ships without that overlay.
    const brollFiles = [];
    for (const [bi, b] of (Array.isArray(spec.broll) ? spec.broll.slice(0, 6) : []).entries()) {
      if (!b || !b.video_url) continue;
      const bp = path.join(os.tmpdir(), `ff-br-${work}-${bi}.mp4`);
      try {
        const r = await fetch(b.video_url);
        if (!r.ok) throw new Error('http ' + r.status);
        fs.writeFileSync(bp, Buffer.from(await r.arrayBuffer()));
        brollFiles.push({ path: bp, at: Math.max(0, Number(b.at_sec) || 0), dur: Math.max(0.4, Number(b.duration_sec) || 0) });
        cleanup.push(bp);
      } catch (e) { console.warn(`[slice-worker] broll ${bi} download failed (skipping): ${e?.message || e}`); }
    }
    let musicFile = null;
    if (spec.music && spec.music.audio_url) {
      const mp = path.join(os.tmpdir(), `ff-mus-${work}.m4a`);
      try {
        const r = await fetch(spec.music.audio_url);
        if (!r.ok) throw new Error('http ' + r.status);
        fs.writeFileSync(mp, Buffer.from(await r.arrayBuffer()));
        musicFile = mp;
        cleanup.push(mp);
      } catch (e) { console.warn('[slice-worker] music download failed (skipping):', e?.message || e); }
    }

    const foDur = Math.min(0.3, Math.max(0, len - 0.3));
    const foStart = Math.max(0, len - foDur).toFixed(3);
    // COVER, not letterbox (2026-06-12 Brandon: "video taking up half the
    // screen and text is the other half"). The old ...decrease,pad=...black
    // squeezed any non-9:16 source (Android studio takes can arrive as a
    // landscape track) into a small strip with black bars, and the caption
    // marginV landed on the bar instead of the video. increase + center crop
    // fills the 1080x1920 frame so captions burn ON the video. ffmpeg honors
    // rotation metadata by default (no -noautorotate anywhere), so upright
    // phone footage stays upright; true-landscape sources lose their sides
    // instead of getting black halves — correct for a 9:16 target.
    const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1${assFilter},fade=t=in:st=0:d=0.2${foDur > 0 ? `,fade=t=out:st=${foStart}:d=${foDur.toFixed(3)}` : ''}`;
    const af = `loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.2${foDur > 0 ? `,afade=t=out:st=${foStart}:d=${foDur.toFixed(3)}` : ''}`;

    if (brollFiles.length === 0 && !musicFile && !ranges) {
      // Fast path — plain slice + captions + audio polish (unchanged).
      await execFileAsync(FFMPEG, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', src, '-ss', start.toFixed(3), '-t', len.toFixed(3),
        '-vf', vf, '-af', af,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', out,
      ], { timeout: 240000, maxBuffer: 64 * 1024 * 1024, cwd: os.tmpdir() });
    } else {
      // Composite path — trim INSIDE the filtergraph (setpts to 0) so caption
      // timing, fades, and overlay enable-windows all share one clip-relative
      // clock. Optionally stitch multi-range retake edits, then chain B-roll
      // overlays and duck music under speech.
      const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', src];
      if (musicFile) args.push('-stream_loop', '-1', '-i', musicFile);
      for (const b of brollFiles) args.push('-i', b.path);

      const parts = [];
      if (ranges) {
        // Jump-cut / retake edit: cut each keep-range, alternate a subtle
        // punch-in (1.08x on odd segments) so every cut reads as intentional,
        // normalize each segment to 1080x1920, stitch with concat, THEN
        // captions + fades on the stitched timeline.
        const punch = spec.punch_in !== false && ranges.length >= 2;
        // Cover + center-crop — same 2026-06-12 fix as `vf` above: the old
        // decrease+pad letterboxed non-9:16 segments onto black halves.
        // setsar=1 is required: scale preserves DAR by tweaking SAR, so the
        // punch-in (cropped) segments can come out with SAR 71003:71010-style
        // values while clean segments are 1:1 — and concat refuses to link
        // pads whose SARs differ ("Input link parameters do not match").
        const scaleCover = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';
        const punchCrop = 'crop=iw/1.08:ih/1.08:(iw-iw/1.08)/2:(ih-ih/1.08)/2,';
        ranges.forEach((r, i) => {
          const zoom = punch && i % 2 === 1 ? punchCrop : '';
          parts.push(`[0:v]trim=start=${r.s.toFixed(3)}:duration=${(r.e - r.s).toFixed(3)},setpts=PTS-STARTPTS,${zoom}${scaleCover}[kv${i}]`);
          parts.push(`[0:a]atrim=start=${r.s.toFixed(3)}:duration=${(r.e - r.s).toFixed(3)},asetpts=PTS-STARTPTS[ka${i}]`);
        });
        parts.push(`${ranges.map((_, i) => `[kv${i}][ka${i}]`).join('')}concat=n=${ranges.length}:v=1:a=1[vcat][acat]`);
        // Captions + fades AFTER the stitch (timing already remapped above).
        const postVf = `${assFilter ? assFilter.slice(1) + ',' : ''}fade=t=in:st=0:d=0.2${foDur > 0 ? `,fade=t=out:st=${foStart}:d=${foDur.toFixed(3)}` : ''}`;
        parts.push(`[vcat]${postVf}[vbase]`);
        parts.push(`[acat]${af}[abase]`);
        console.log(`[slice-worker] edit: ${ranges.length} segment(s) stitched, punch_in=${punch}, ${len.toFixed(1)}s total`);
      } else {
        parts.push(`[0:v]trim=start=${start.toFixed(3)}:duration=${len.toFixed(3)},setpts=PTS-STARTPTS,${vf}[vbase]`);
        parts.push(`[0:a]atrim=start=${start.toFixed(3)}:duration=${len.toFixed(3)},asetpts=PTS-STARTPTS,${af}[abase]`);
      }

      let curV = 'vbase';
      const brollFirstIdx = musicFile ? 2 : 1;
      let chained = 0;
      for (let i = 0; i < brollFiles.length; i++) {
        const b = brollFiles[i];
        const at = Math.max(0, Math.min(b.at, len - 0.2));
        const dur = Math.max(0.4, Math.min(b.dur, len - at));
        if (dur <= 0.4) continue;
        const inIdx = brollFirstIdx + i;
        // Cover the 9:16 frame (scale up + center-crop) and shift so the
        // b-roll's first frame lands at its scheduled at_sec.
        parts.push(`[${inIdx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=PTS-STARTPTS+${at.toFixed(3)}/TB[br${i}]`);
        const nextV = `vmix${i}`;
        parts.push(`[${curV}][br${i}]overlay=enable='between(t,${at.toFixed(3)},${(at + dur).toFixed(3)})':eof_action=pass[${nextV}]`);
        curV = nextV;
        chained++;
      }
      parts.push(`[${curV}]null[vout]`);

      if (musicFile) {
        const musicVol = Number.isFinite(Number(spec.music?.volume_db)) ? Number(spec.music.volume_db) : -16;
        parts.push(`[1:a]volume=${musicVol}dB,atrim=duration=${len.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, len - 0.6).toFixed(3)}:d=0.6[mbg]`);
        parts.push(`[abase][mbg]amix=inputs=2:duration=first:weights=1 0.6:normalize=0[aout]`);
      } else {
        parts.push(`[abase]anull[aout]`);
      }

      console.log(`[slice-worker] composite render: broll=${chained} music=${musicFile ? 'yes' : 'no'}`);
      await execFileAsync(FFMPEG, [
        ...args,
        '-filter_complex', parts.join(';'),
        '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k',
        // Explicit -t instead of -shortest (2026-06-12 "cuts off the video
        // sooner" with B-roll on): MediaRecorder sources (studio takes) often
        // carry an audio stream a hair shorter than the video, and -shortest
        // let that — or any short polish input — truncate the whole clip.
        // The filtergraph already trims everything to `len`; pin the output
        // to exactly that so duration never depends on b-roll/music lengths.
        '-t', len.toFixed(3), out,
      ], { timeout: 300000, maxBuffer: 64 * 1024 * 1024, cwd: os.tmpdir() });
    }
    if (!fs.existsSync(out) || fs.statSync(out).size < 1024) throw new Error('ffmpeg produced no/empty output');
    const bytes = fs.statSync(out).size;
    const key = `ve-renders/${spec.user_id}/${spec.clip_id}.mp4`;
    const up = await sb.storage.from(RENDERS_BUCKET).upload(key, fs.readFileSync(out), { contentType: 'video/mp4', upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${RENDERS_BUCKET}/${key}`;
    const now = new Date().toISOString();
    await sb.from('ff_render_jobs').update({ status: 'done', output_url: publicUrl, output_bytes: bytes, duration_ms: Math.round(len * 1000), completed_at: now, updated_at: now }).eq('id', job.id);
    await sb.from('ve_rendered_clips').update({ status: 'complete', output_url: publicUrl, duration_sec: len, completed_at: now }).eq('ff_render_job_id', job.id);
    console.log(`[slice-worker] DONE job=${job.id} clip=${spec.clip_id} ${bytes}B -> ${publicUrl}`);
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    console.error(`[slice-worker] FAIL job=${job.id}: ${msg}`);
    await sb.from('ff_render_jobs').update({ status: 'failed', error: trimErr(msg, 200, 700), updated_at: new Date().toISOString() }).eq('id', job.id);
    await sb.from('ve_rendered_clips').update({ status: 'failed', error_message: trimErr(msg, 100, 350) }).eq('ff_render_job_id', job.id);
  } finally {
    for (const f of cleanup) { try { fs.existsSync(f) && fs.unlinkSync(f); } catch {} }
  }
}

async function main() {
  console.log(`[slice-worker] starting on ${os.hostname()} -> ${SUPABASE_URL}`);
  const workerId = await registerWorker();
  let idle = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await sb.from('ff_render_workers').update({ last_heartbeat_at: new Date().toISOString(), status: 'online' }).eq('id', workerId);
      // Link ingest piggybacks on the render loop — it was previously defined
      // but never called, which is why /create link jobs sat in 'created'
      // forever ("awaiting link ingest" gate in pipeline.ts). One cheap select
      // per tick when nothing is pending; errors never kill the loop.
      try { await ingestLinks(); } catch (e) { console.error('[slice-worker] ingestLinks error:', e?.message || e); }
      const { data: pend } = await sb.from('ff_render_jobs')
        .select('id').eq('status', 'pending').eq('kind', 'clip_render')
        .order('priority', { ascending: true }).order('created_at', { ascending: true }).limit(1);
      if (!pend || pend.length === 0) { idle++; if (idle % 15 === 0) console.log('[slice-worker] queue empty'); await sleep(POLL_MS); continue; }
      const claimIso = new Date().toISOString();
      const { data: claimed } = await sb.from('ff_render_jobs')
        .update({ status: 'rendering', claimed_by: workerId, claimed_at: claimIso, started_at: claimIso, updated_at: claimIso })
        .eq('id', pend[0].id).eq('status', 'pending').select('*').maybeSingle();
      if (!claimed || !claimed.id) { await sleep(250); continue; }
      idle = 0;
      console.log(`[slice-worker] claimed job=${claimed.id}`);
      await renderJob(claimed);
    } catch (e) {
      console.error('[slice-worker] loop error:', e?.message || e);
      await sleep(POLL_MS * 2);
    }
  }
}
main().catch((e) => { console.error('[slice-worker] fatal:', e); process.exit(1); });
