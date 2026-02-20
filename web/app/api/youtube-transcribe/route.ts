import { NextResponse } from 'next/server';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import {
  isValidYouTubeUrl,
  extractYouTubeCaptions,
  downloadYouTubeAudio,
} from '@/lib/youtube-transcript';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ============================================================================
// Rate Limiting (same Supabase-backed system as TikTok)
// ============================================================================

const TIER_LIMITS: Record<string, number> = {
  anon: 10,
  free: 50,
  creator_lite: 100,
  creator_pro: 250,
  brand: 500,
  agency: -1,
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
// POST /api/youtube-transcribe
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

  if (!isValidYouTubeUrl(url)) {
    return NextResponse.json(
      { error: 'Please provide a valid YouTube URL (e.g. https://www.youtube.com/watch?v=...)' },
      { status: 400 }
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const filesToClean: string[] = [];

  try {
    let transcript = '';
    let segments: { start: number; end: number; text: string }[] = [];
    let duration = 0;
    let language = 'en';

    // Step 1: Try caption extraction first (fast, free)
    console.log('[yt-transcribe] Extracting captions for:', url);
    const captions = await extractYouTubeCaptions(url);

    if (captions) {
      console.log('[yt-transcribe] Got captions:', captions.transcript.length, 'chars');
      transcript = captions.transcript;
      segments = captions.segments;
      duration = captions.duration;
      language = captions.language;
    } else {
      // Step 2: Whisper fallback — download audio and transcribe
      console.log('[yt-transcribe] No captions, falling back to Whisper...');

      if (!openaiKey) {
        console.error('[yt-transcribe] OPENAI_API_KEY not configured');
        return NextResponse.json({ error: 'Transcription service is not configured.' }, { status: 500 });
      }

      const { audioPath, duration: audioDuration } = await downloadYouTubeAudio(url);
      filesToClean.push(audioPath);
      duration = audioDuration;

      console.log('[yt-transcribe] Sending audio to Whisper...');
      const openai = new OpenAI({ apiKey: openaiKey });

      const transcription = await openai.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      transcript = transcription.text || '';
      segments = (transcription.segments || []).map((s) => ({
        start: s.start, end: s.end, text: s.text,
      }));
      duration = transcription.duration || duration;
      language = transcription.language || 'en';
    }

    // Step 3: AI Analysis via Claude Haiku (best-effort)
    let analysis = null;

    if (anthropicKey && transcript.length > 10) {
      console.log('[yt-transcribe] Running AI analysis...');
      try {
        const analysisPrompt = `Analyze this YouTube video transcript. Return ONLY valid JSON with no markdown formatting or explanation.

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
          console.warn('[yt-transcribe] Claude analysis failed:', claudeRes.status);
        }
      } catch (e) {
        console.warn('[yt-transcribe] Analysis error (non-fatal):', e);
      }
    }

    cleanupFiles(filesToClean);

    // Log usage
    const processingTimeMs = Date.now() - requestStart;
    const { error: insertErr } = await supabaseAdmin
      .from('transcribe_usage')
      .insert({ ip, user_id: userId, url_transcribed: url, processing_time_ms: processingTimeMs });
    if (insertErr) console.warn('[yt-transcribe] Failed to log usage:', insertErr.message);

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
    console.error('[yt-transcribe] Error:', err);

    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('timed out') || message.includes('ETIMEDOUT') || message.includes('AbortError')) {
      return NextResponse.json(
        { error: 'The download timed out. The video may be too long or the connection is slow.' },
        { status: 504 }
      );
    }

    if (message.includes('audio download failed') || message.includes('Unable to download')) {
      return NextResponse.json(
        { error: 'Could not download this YouTube video. It may be private, age-restricted, or region-locked.' },
        { status: 422 }
      );
    }

    if (message.includes('max-filesize') || message.includes('File is larger')) {
      return NextResponse.json(
        { error: 'This video is too large to process. Try a shorter video.' },
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
