import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchYouTubeTranscript, isValidYouTubeUrl } from '@/lib/youtube-transcript';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ============================================================================
// Rate Limiting (reuses same transcribe_usage table)
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
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const limit = await getLimitForUser(userId);
  if (limit === -1) return { allowed: true, remaining: -1, limit: -1 };

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

  return { allowed: used < limit, remaining, limit };
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
      { error: msg },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  }

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const requestStart = Date.now();

  try {
    // Step 1: Extract transcript from YouTube captions
    console.log('[youtube-transcribe] Fetching captions for:', url);
    const { transcript, segments, videoId } = await fetchYouTubeTranscript(url);
    console.log('[youtube-transcribe] Got transcript:', transcript.length, 'chars');

    // Step 2: AI Summary via Claude Haiku
    let analysis = null;

    if (anthropicKey && transcript.length > 20) {
      console.log('[youtube-transcribe] Running AI summary...');
      try {
        const summaryPrompt = `Analyze this YouTube video transcript and provide a structured summary. Return ONLY valid JSON with no markdown formatting or explanation.

TRANSCRIPT:
${transcript.slice(0, 12000)}

Return this exact JSON structure:
{
  "summary": "<2-3 paragraph overview of what the video covers, key arguments, and conclusions>",
  "keyPoints": ["<key point 1>", "<key point 2>", ...],
  "topics": ["<topic tag 1>", "<topic tag 2>", ...],
  "takeaways": ["<actionable takeaway 1>", "<actionable takeaway 2>", ...],
  "suggestedQuestions": ["<question a user might ask about this video>", "<another question>", "<third question>", "<fourth question>"]
}

Guidelines:
- summary: Write 2-3 paragraphs that capture the main content, arguments, and conclusions
- keyPoints: 4-8 specific, factual points made in the video
- topics: 3-6 short topic tags (1-3 words each) representing the main themes
- takeaways: 3-5 actionable items the viewer can apply
- suggestedQuestions: 3-4 natural questions someone might want to ask about this content (e.g. "What tools were mentioned?", "What are the main steps?")`;

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2000,
            temperature: 0.3,
            messages: [{ role: 'user', content: summaryPrompt }],
          }),
          signal: AbortSignal.timeout(20000),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const text = claudeData.content?.[0]?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
        } else {
          console.warn('[youtube-transcribe] Claude analysis failed:', claudeRes.status);
        }
      } catch (e) {
        console.warn('[youtube-transcribe] Analysis error (non-fatal):', e);
      }
    }

    // Log usage
    const processingTimeMs = Date.now() - requestStart;
    await supabaseAdmin
      .from('transcribe_usage')
      .insert({ ip, user_id: userId, url_transcribed: url, processing_time_ms: processingTimeMs })
      .then(({ error: insertErr }) => {
        if (insertErr) console.warn('[youtube-transcribe] Failed to log usage:', insertErr.message);
      });

    return NextResponse.json(
      { transcript, segments, videoId, analysis },
      {
        headers: {
          'X-RateLimit-Remaining': String(remaining === -1 ? -1 : remaining - 1),
          'X-RateLimit-Limit': String(limit),
        },
      }
    );
  } catch (err) {
    console.error('[youtube-transcribe] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('No captions available')) {
      return NextResponse.json(
        { error: 'No captions available for this video. The video may not have subtitles enabled.' },
        { status: 422 }
      );
    }

    if (message.includes('Could not extract video ID')) {
      return NextResponse.json(
        { error: 'Could not parse this YouTube URL. Please check the URL and try again.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to transcribe this video. Please check the URL and try again.' },
      { status: 500 }
    );
  }
}
