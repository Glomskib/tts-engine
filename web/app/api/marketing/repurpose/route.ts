/**
 * API: Marketing Repurpose — TikTok/YouTube → Facebook (+ other platforms)
 *
 * POST /api/marketing/repurpose
 * Body: {
 *   source_url, target_platforms?, caption_override?, auto_publish?,
 *   facebook_page_id?, content_type?, brand?, manual_transcript?
 * }
 *
 * Flow:
 *   1. Validate request + detect source platform
 *   2. Check cache: if marketing_assets already has transcript for this URL, reuse it
 *   3. Extract transcript (TikTok=Whisper, YouTube=captions, fallback=oembed title)
 *   4. Generate structured caption pack via Claude Haiku
 *   5. Run claim risk on generated captions
 *   6. Create marketing_post row + marketing_assets rows
 *   7. If auto_publish && risk.safe → schedule via Late; else → pending (draft)
 *
 * Returns: structured pack with facebook_caption_short, facebook_post_long,
 *          instagram_caption, hashtags, claim_risk, needs_transcript flag
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createPost, isConfigured } from '@/lib/marketing/late-service';
import { classifyClaimRisk } from '@/lib/marketing/claim-risk';
import { resolveTargets } from '@/lib/marketing/brand-accounts';
import { generateRunId } from '@/lib/marketing/queue';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import type { PlatformTarget } from '@/lib/marketing/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // transcript extraction can take time

const LOG_PREFIX = '[marketing/repurpose]';

interface RepurposeBody {
  source_url: string;
  target_platforms?: string[];
  caption_override?: string;
  auto_publish?: boolean;
  facebook_page_id?: string;
  content_type?: 'feed' | 'reel';
  brand?: string;
  manual_transcript?: string;
}

interface CaptionPack {
  facebook_caption_short: string;
  facebook_post_long: string;
  instagram_caption: string;
  hashtags: string[];
  needs_transcript: boolean;
}

// ── Platform detection ───────────────────────────────────────────
function detectPlatform(url: string): 'tiktok' | 'youtube' | 'unknown' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Cached transcript lookup ─────────────────────────────────────
async function getCachedTranscript(sourceUrl: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('marketing_assets')
      .select('meta')
      .eq('source_url', sourceUrl)
      .eq('asset_type', 'transcript')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return data?.meta?.transcript_text as string || null;
  } catch {
    return null;
  }
}

// ── Cached caption pack lookup ───────────────────────────────────
async function getCachedPack(sourceUrl: string): Promise<CaptionPack | null> {
  try {
    const { data } = await supabaseAdmin
      .from('marketing_assets')
      .select('meta')
      .eq('source_url', sourceUrl)
      .eq('asset_type', 'transcript')
      .not('meta->caption_pack', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data?.meta?.caption_pack) {
      return data.meta.caption_pack as CaptionPack;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Transcript extraction ────────────────────────────────────────
async function extractTranscript(
  url: string,
  platform: 'tiktok' | 'youtube' | 'unknown',
  manualTranscript?: string,
): Promise<{ transcript: string; source: string; needs_transcript: boolean; duration?: number }> {
  // Manual transcript override
  if (manualTranscript && manualTranscript.trim().length > 10) {
    return { transcript: manualTranscript.trim(), source: 'manual', needs_transcript: false };
  }

  // Check cache first
  const cached = await getCachedTranscript(url);
  if (cached) {
    console.log(`${LOG_PREFIX} Using cached transcript for ${url}`);
    return { transcript: cached, source: 'cache', needs_transcript: false };
  }

  // Platform-specific extraction
  if (platform === 'tiktok' || platform === 'youtube') {
    try {
      // Dynamic import to avoid bundling issues with native modules
      const { getTranscript } = await import('@/lib/creator-style/transcript-adapter');
      const result = await getTranscript(url, platform);
      return {
        transcript: result.transcript,
        source: result.source,
        needs_transcript: false,
        duration: result.duration_seconds,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG_PREFIX} Transcript extraction failed for ${platform}: ${msg}`);
    }
  }

  // TikTok fallback: try oembed for title/description
  if (platform === 'tiktok') {
    try {
      const oembedRes = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        const title = oembed.title || '';
        const author = oembed.author_name || '';
        if (title.length > 10) {
          return {
            transcript: `[From ${author}]: ${title}`,
            source: 'oembed-title',
            needs_transcript: true,
          };
        }
      }
    } catch {
      // oembed also failed
    }
  }

  // Complete fallback
  return {
    transcript: '',
    source: 'none',
    needs_transcript: true,
  };
}

// ── Caption pack generation via Claude Haiku ─────────────────────
async function generateCaptionPack(
  transcript: string,
  brand: string,
  sourceUrl: string,
): Promise<CaptionPack> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || transcript.length < 10) {
    return {
      facebook_caption_short: transcript.slice(0, 200),
      facebook_post_long: transcript,
      instagram_caption: transcript.slice(0, 2200),
      hashtags: [],
      needs_transcript: transcript.length < 10,
    };
  }

  try {
    const systemPrompt = `You are a social media copywriter for the brand "${brand}".
Generate a caption pack for repurposing this video content to Facebook and Instagram.

Respond with ONLY a JSON object (no markdown fences, no extra text):
{
  "facebook_caption_short": "Under 150 chars, hook-first, emoji OK",
  "facebook_post_long": "2-3 paragraphs, storytelling, CTA at end, max 500 chars",
  "instagram_caption": "Under 2200 chars, hook line + body + CTA + hashtags in text",
  "hashtags": ["tag1", "tag2", ...up to 10 relevant hashtags without #]
}

Brand voice: ${brand === "Zebby's World" ? 'Warm, educational, empowering, community-centered' : 'Energetic, inclusive, celebrates community'}
NEVER make health claims, income promises, or guarantees.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `Video transcript:\n\n${transcript.slice(0, 4000)}\n\nSource: ${sourceUrl}` },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn(`${LOG_PREFIX} Haiku caption generation failed: HTTP ${res.status}`);
      throw new Error(`Haiku HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    // Strip markdown fences if present
    const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const pack = JSON.parse(jsonStr);

    return {
      facebook_caption_short: pack.facebook_caption_short || '',
      facebook_post_long: pack.facebook_post_long || '',
      instagram_caption: pack.instagram_caption || '',
      hashtags: Array.isArray(pack.hashtags) ? pack.hashtags : [],
      needs_transcript: false,
    };
  } catch (err) {
    console.warn(`${LOG_PREFIX} Caption generation fallback:`, err instanceof Error ? err.message : err);
    // Fallback: use transcript directly
    return {
      facebook_caption_short: transcript.slice(0, 150),
      facebook_post_long: transcript.slice(0, 500),
      instagram_caption: transcript.slice(0, 2200),
      hashtags: [],
      needs_transcript: false,
    };
  }
}

// ── Main handler ─────────────────────────────────────────────────
export async function POST(request: Request) {
  // Auth: accept CRON_SECRET (server-to-server) OR admin session (browser UI)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const serviceToken = request.headers.get('x-service-token');

  const isTokenAuthed = (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
                        (cronSecret && serviceToken === cronSecret);

  let isAuthed = isTokenAuthed;
  if (!isAuthed) {
    // Fallback: admin session auth (for browser-based admin UI)
    const authContext = await getApiAuthContext(request);
    isAuthed = !!(authContext.user && authContext.isAdmin);
  }

  if (!isAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: 'LATE_API_KEY not configured' }, { status: 503 });
  }

  let body: RepurposeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.source_url || typeof body.source_url !== 'string') {
    return NextResponse.json({ error: 'source_url is required' }, { status: 400 });
  }

  const runId = generateRunId('repurpose');
  const platform = detectPlatform(body.source_url);
  const brand = body.brand || 'Making Miles Matter';
  const targetPlatforms = body.target_platforms || ['facebook'];
  const autoPublish = body.auto_publish ?? false;
  const contentType = body.content_type || 'reel';

  console.log(`${LOG_PREFIX} [${runId}] Start: platform=${platform} brand="${brand}" url=${body.source_url}`);

  // Check for cached full pack first (avoid repeat LLM spend)
  const cachedPack = await getCachedPack(body.source_url);
  let captionPack: CaptionPack;
  let transcriptText = '';
  let transcriptSource = 'cache';
  let needsTranscript = false;
  let durationSecs: number | undefined;

  if (cachedPack && !body.caption_override) {
    console.log(`${LOG_PREFIX} [${runId}] Using cached caption pack`);
    captionPack = cachedPack;
    needsTranscript = cachedPack.needs_transcript;
  } else {
    // Extract transcript
    const txResult = await extractTranscript(body.source_url, platform, body.manual_transcript);
    transcriptText = txResult.transcript;
    transcriptSource = txResult.source;
    needsTranscript = txResult.needs_transcript;
    durationSecs = txResult.duration;

    console.log(`${LOG_PREFIX} [${runId}] Transcript: source=${transcriptSource} len=${transcriptText.length} needs_transcript=${needsTranscript}`);

    // Generate caption pack (or use override)
    if (body.caption_override) {
      captionPack = {
        facebook_caption_short: body.caption_override.slice(0, 150),
        facebook_post_long: body.caption_override,
        instagram_caption: body.caption_override.slice(0, 2200),
        hashtags: [],
        needs_transcript: false,
      };
    } else {
      captionPack = await generateCaptionPack(transcriptText, brand, body.source_url);
      captionPack.needs_transcript = needsTranscript;
    }
  }

  // Resolve brand → platform targets
  const platforms: PlatformTarget[] = await resolveTargets(
    brand,
    targetPlatforms.map(p => p.toLowerCase()) as Array<'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'youtube' | 'pinterest' | 'reddit'>,
  );

  // Override facebook page if specified
  if (body.facebook_page_id) {
    for (const t of platforms) {
      if (t.platform === 'facebook') {
        t.platformSpecificData = {
          ...t.platformSpecificData,
          contentType: contentType === 'reel' ? 'reel' : 'feed',
          pageId: body.facebook_page_id,
        };
      }
    }
  }

  if (platforms.length === 0) {
    return NextResponse.json({ error: 'No valid target platforms resolved' }, { status: 400 });
  }

  // Claim risk check on the main caption
  const risk = classifyClaimRisk(captionPack.facebook_post_long);

  // Determine status
  let status: 'pending' | 'scheduled' = 'pending';
  let latePostId: string | undefined;

  if (autoPublish && risk.safe && !needsTranscript) {
    const result = await createPost({
      content: captionPack.facebook_post_long,
      mediaItems: [{ type: 'video', url: body.source_url }],
      platforms,
      publishNow: false,
    });
    if (result.ok) {
      status = 'scheduled';
      latePostId = result.postId;
    }
  }

  // Insert marketing_post
  const { data: post, error: insertErr } = await supabaseAdmin
    .from('marketing_posts')
    .insert({
      content: captionPack.facebook_post_long,
      media_items: [{ type: 'video' as const, url: body.source_url }],
      platforms,
      status,
      source: 'repurpose',
      late_post_id: latePostId,
      claim_risk_score: risk.score,
      claim_risk_flags: risk.flags,
      meta: {
        run_id: runId,
        source_url: body.source_url,
        source_platform: platform,
        brand,
        target_platforms: targetPlatforms,
        content_type: contentType,
        auto_publish: autoPublish,
        draft: true,
        needs_transcript: needsTranscript,
        transcript_source: transcriptSource,
        caption_pack: captionPack,
      },
    })
    .select('id, status')
    .single();

  if (insertErr) {
    console.error(`${LOG_PREFIX} [${runId}] Insert error:`, insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Store assets: video + transcript (for caching)
  if (post) {
    // Video asset
    await supabaseAdmin.from('marketing_assets').insert({
      post_id: post.id,
      asset_type: 'video',
      url: body.source_url,
      source_url: body.source_url,
      platform,
      duration_secs: durationSecs,
      meta: { content_type: contentType, run_id: runId },
    });

    // Cache transcript + caption pack as an asset (avoids repeat LLM calls)
    if (transcriptText.length > 0) {
      await supabaseAdmin.from('marketing_assets').insert({
        post_id: post.id,
        asset_type: 'transcript',
        url: body.source_url,
        source_url: body.source_url,
        platform,
        duration_secs: durationSecs,
        meta: {
          transcript_text: transcriptText,
          transcript_source: transcriptSource,
          caption_pack: captionPack,
          run_id: runId,
        },
      });
    }
  }

  console.log(`${LOG_PREFIX} [${runId}] Done: post_id=${post?.id} status=${status} risk=${risk.score} needs_transcript=${needsTranscript}`);

  return NextResponse.json({
    ok: true,
    run_id: runId,
    post_id: post?.id,
    status: post?.status,
    source_platform: platform,
    needs_transcript: needsTranscript,
    transcript_source: transcriptSource,
    caption_pack: captionPack,
    claim_risk: {
      score: risk.score,
      flags: risk.flags,
      level: risk.level,
      safe: risk.safe,
      needs_review: risk.needs_review,
      blocked: risk.blocked,
      requires_human_approval: risk.requires_human_approval,
    },
    late_post_id: latePostId || null,
  });
}
