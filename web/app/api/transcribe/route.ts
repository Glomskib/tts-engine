import { NextResponse } from 'next/server';
import { tmpdir } from 'os';
import { join } from 'path';
import { stat, unlink, writeFile } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const execFileAsync = promisify(execFile);
const WHISPER_MAX_SIZE = 24 * 1024 * 1024; // 24 MB (Whisper limit is 25MB, keep buffer)

// ============================================================================
// Rate Limiting (Supabase-backed)
// ============================================================================

const TIER_LIMITS: Record<string, number> = {
  anon: 10,
  free: 50,
  creator_lite: 100,
  creator_pro: 250,
  brand: 500,
  agency: -1, // unlimited
};

async function getLimitForUser(userId: string | null): Promise<number> {
  if (!userId) return TIER_LIMITS.anon;

  const { data } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data?.plan_id) return TIER_LIMITS.free;

  const planId = data.plan_id as string;
  // Match plan_id against tier keys (plan_id may contain the tier name)
  for (const tier of Object.keys(TIER_LIMITS)) {
    if (tier !== 'anon' && tier !== 'free' && planId.includes(tier)) {
      return TIER_LIMITS[tier];
    }
  }
  return TIER_LIMITS.free;
}

async function checkRateLimit(
  ip: string,
  userId: string | null
): Promise<{ allowed: boolean; remaining: number; limit: number; used: number }> {
  const limit = await getLimitForUser(userId);

  // Unlimited tier
  if (limit === -1) {
    return { allowed: true, remaining: -1, limit: -1, used: 0 };
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let query = supabaseAdmin
    .from('transcribe_usage')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('ip', ip).is('user_id', null);
  }

  const { count } = await query;
  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);

  return { allowed: used < limit, remaining, limit, used };
}

// ============================================================================
// TikTok download (resilient fallback chain)
// ============================================================================
import { downloadTikTokVideo } from '@/lib/tiktok-downloader';

// ============================================================================
// TikTok URL validation
// ============================================================================

function isValidTikTokUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return [
      'www.tiktok.com', 'tiktok.com', 'vm.tiktok.com', 'm.tiktok.com', 'vt.tiktok.com',
    ].includes(parsed.hostname);
  } catch {
    return false;
  }
}

// Download logic moved to lib/tiktok-downloader.ts (5-service fallback chain)

// ============================================================================
// Prepare audio file for Whisper
// ============================================================================

async function prepareAudioFile(videoPath: string): Promise<string> {
  const fileSize = (await stat(videoPath)).size;

  // If video is small enough, Whisper can handle mp4 directly
  if (fileSize <= WHISPER_MAX_SIZE) {
    return videoPath;
  }

  // For larger files, extract audio with ffmpeg (bundled binary for serverless)
  const audioPath = videoPath.replace('.mp4', '.mp3');
  await execFileAsync(ffmpegInstaller.path, [
    '-i', videoPath,
    '-vn',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-ar', '44100',
    '-y',
    audioPath,
  ], { timeout: 15000 });

  if (!existsSync(audioPath)) {
    throw new Error('Audio extraction failed');
  }

  return audioPath;
}

// ============================================================================
// POST /api/transcribe
// ============================================================================

export async function POST(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

  const auth = await getApiAuthContext(request);
  const userId = auth.user?.id ?? null;

  const { allowed, remaining, limit } = await checkRateLimit(ip, userId);

  if (!allowed) {
    const msg = userId
      ? "You've reached your daily transcription limit. Check back tomorrow!"
      : "You've reached your daily limit. Sign up for FlashFlow to get more transcriptions!";
    return NextResponse.json(
      { error: msg, signupUrl: userId ? undefined : '/signup' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  }

  const requestStart = Date.now();

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required.' }, { status: 400 });
  }

  if (!isValidTikTokUrl(url)) {
    return NextResponse.json(
      { error: 'Please provide a valid TikTok URL (e.g. https://www.tiktok.com/@user/video/...)' },
      { status: 400 }
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('[transcribe] OPENAI_API_KEY not configured');
    return NextResponse.json({ error: 'Transcription service is not configured.' }, { status: 500 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const id = randomUUID();
  const videoPath = join(tmpdir(), `tiktok-${id}.mp4`);
  const filesToClean: string[] = [videoPath];

  try {
    // Step 1: Download video
    console.log('[transcribe] Downloading video from:', url);
    const videoBuffer = await downloadTikTokVideo(url);
    await writeFile(videoPath, videoBuffer);
    console.log('[transcribe] Downloaded:', (videoBuffer.length / 1024 / 1024).toFixed(1), 'MB');

    // Step 2: Prepare audio (small files go direct, large files need ffmpeg)
    const whisperInputPath = await prepareAudioFile(videoPath);
    if (whisperInputPath !== videoPath) filesToClean.push(whisperInputPath);

    // Step 3: Transcribe with Whisper
    console.log('[transcribe] Sending to Whisper...');
    const openai = new OpenAI({ apiKey: openaiKey });

    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(whisperInputPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const transcript = transcription.text || '';
    const segments = (transcription.segments || []).map((s) => ({
      start: s.start, end: s.end, text: s.text,
    }));
    const duration = transcription.duration || 0;
    const language = transcription.language || 'en';

    // Step 4: AI Analysis via Claude Haiku (best-effort)
    let analysis = null;

    if (anthropicKey && transcript.length > 10) {
      console.log('[transcribe] Running AI analysis...');
      try {
        const analysisPrompt = `Analyze this TikTok video transcript. Return ONLY valid JSON with no markdown formatting or explanation.

TRANSCRIPT:
${transcript}

Return this exact JSON structure:
{
  "hook": {
    "line": "<the first sentence/hook line from the transcript>",
    "style": "<one of: question, shock, relatable, controversial, curiosity, story, instruction>",
    "strength": <1-10 integer>
  },
  "content": {
    "format": "<e.g. tutorial, story time, product review, skit, rant, educational, day-in-life>",
    "pacing": "<e.g. fast and punchy, conversational, slow build, rapid-fire>",
    "structure": "<e.g. hook-problem-solution, hook-story-cta, list format, before/after>"
  },
  "keyPhrases": ["<3-6 memorable phrases or power words used>"],
  "emotionalTriggers": ["<2-4 emotions the content targets>"],
  "productMentions": ["<any products/brands mentioned, or empty array>"],
  "whatWorks": ["<3-5 specific things this creator does well>"],
  "targetEmotion": "<the primary emotion this content targets>"
}`;

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            temperature: 0.3,
            messages: [{ role: 'user', content: analysisPrompt }],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const text = claudeData.content?.[0]?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
        } else {
          console.warn('[transcribe] Claude analysis failed:', claudeRes.status);
        }
      } catch (e) {
        console.warn('[transcribe] Analysis error (non-fatal):', e);
      }
    }

    cleanupFiles(filesToClean);

    // Log usage for rate limiting + analytics
    const processingTimeMs = Date.now() - requestStart;
    const { error: insertErr } = await supabaseAdmin
      .from('transcribe_usage')
      .insert({ ip, user_id: userId, url_transcribed: url, processing_time_ms: processingTimeMs });
    if (insertErr) console.warn('[transcribe] Failed to log usage:', insertErr.message);

    return NextResponse.json(
      { transcript, segments, duration, language, analysis },
      {
        headers: {
          'X-RateLimit-Remaining': String(remaining === -1 ? -1 : remaining - 1),
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  } catch (err) {
    cleanupFiles(filesToClean);
    console.error('[transcribe] Error:', err);

    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('timed out') || message.includes('ETIMEDOUT') || message.includes('AbortError')) {
      return NextResponse.json(
        { error: 'The download timed out. The video may be too long or the connection is slow.' },
        { status: 504 }
      );
    }

    if (message.includes('All download services failed')) {
      return NextResponse.json(
        { error: 'TikTok download service is temporarily unavailable. Please try again in a few minutes.' },
        { status: 503 }
      );
    }

    if (message.includes('metadata') || message.includes('Could not fetch')) {
      return NextResponse.json(
        { error: 'Could not access this TikTok video. It may be private, deleted, or region-locked.' },
        { status: 422 }
      );
    }

    if (message.includes('Audio extraction') || message.includes('ENOENT')) {
      return NextResponse.json(
        { error: 'This video is too large to process. Try a shorter video (under 3 minutes).' },
        { status: 413 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to transcribe this video. Please check the URL and try again.' },
      { status: 500 }
    );
  }
}

function cleanupFiles(paths: string[]) {
  for (const p of paths) {
    try {
      if (existsSync(p)) unlink(p).catch(() => {});
    } catch { /* ignore */ }
  }
}
