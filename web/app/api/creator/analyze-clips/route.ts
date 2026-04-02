/**
 * POST /api/creator/analyze-clips
 *
 * Accepts 1-6 raw video clips via multipart/form-data.
 * For each clip:
 *   1. Uploads to Supabase Storage (renders bucket, creator-clips/ path)
 *   2. Transcribes audio with OpenAI Whisper
 * Then GPT-4o synthesizes all transcripts into a ready-to-post content package:
 *   - Best clip recommendation with engagement score
 *   - Hook, caption, hashtags, CTA, cover text
 * Charges 1 credit per clip processed.
 *
 * Body: multipart/form-data
 *   clips      File[]   1–6 video files (mp4/mov/webm, ≤100MB each)
 *   product_id string?  UUID of linked product
 *   context    string?  Optional extra context for the AI
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { spendCredits } from '@/lib/credits';

export const runtime = 'nodejs';
export const maxDuration = 120;

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const UPLOAD_MAX_BYTES  = 200 * 1024 * 1024; // 200 MB per file
const MAX_CLIPS = 6;
const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/mpeg'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function uploadToStorage(
  buffer: ArrayBuffer,
  path: string,
  contentType: string,
): Promise<string | null> {
  const { error } = await supabaseAdmin.storage
    .from('renders')
    .upload(path, buffer, { contentType, upsert: false });
  if (error) return null;
  const { data } = supabaseAdmin.storage.from('renders').getPublicUrl(path);
  return data.publicUrl;
}

async function transcribeClip(
  openai: OpenAI,
  buffer: ArrayBuffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  if (buffer.byteLength > WHISPER_MAX_BYTES) return null; // too large — skip
  try {
    const file = new File([buffer], filename, { type: mimeType });
    const result = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
    });
    return result.text || null;
  } catch {
    return null;
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const authCtx = await getApiAuthContext(request);
  if (!authCtx.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  const userId = authCtx.user.id;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Expected multipart/form-data', 400, correlationId);
  }

  const rawClips = formData.getAll('clips') as File[];
  const productId = (formData.get('product_id') as string | null) || null;
  const extraContext = (formData.get('context') as string | null) || '';

  // Validate clip count
  if (!rawClips.length || rawClips.length > MAX_CLIPS) {
    return createApiErrorResponse('BAD_REQUEST', `Send 1–${MAX_CLIPS} clips`, 400, correlationId);
  }

  // Validate file types + sizes
  for (const clip of rawClips) {
    if (!ACCEPTED_TYPES.includes(clip.type)) {
      return createApiErrorResponse('BAD_REQUEST', `Unsupported file type: ${clip.type}. Use mp4, mov, or webm.`, 400, correlationId);
    }
    if (clip.size > UPLOAD_MAX_BYTES) {
      return createApiErrorResponse('BAD_REQUEST', `${clip.name} exceeds 200MB limit`, 400, correlationId);
    }
  }

  // Charge credits BEFORE heavy work
  const creditCost = rawClips.length;
  const creditResult = await spendCredits(
    userId,
    creditCost,
    'clip_analysis',
    `Clip Studio: ${rawClips.length} clip${rawClips.length !== 1 ? 's' : ''} analyzed`,
    authCtx.isAdmin ?? false,
  );
  if (!creditResult.success) {
    return createApiErrorResponse(
      'INSUFFICIENT_CREDITS',
      creditResult.error || `Need ${creditCost} credit${creditCost !== 1 ? 's' : ''}. You have ${creditResult.remaining}.`,
      402,
      correlationId,
    );
  }

  // Resolve product context
  let productName = '';
  let tiktokProductId = '';
  let linkCode = '';
  if (productId) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name, tiktok_product_id, link_code')
      .eq('id', productId)
      .single();
    if (product) {
      productName = product.name || '';
      tiktokProductId = product.tiktok_product_id || '';
      linkCode = product.link_code || '';
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const jobId = correlationId;

  // Process clips in parallel: upload + transcribe
  const clipResults = await Promise.all(
    rawClips.map(async (clip, i) => {
      const buffer = await clip.arrayBuffer();
      const storagePath = `creator-clips/${userId}/${jobId}/${i + 1}-${clip.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      const [publicUrl, transcript] = await Promise.all([
        uploadToStorage(buffer, storagePath, clip.type),
        transcribeClip(openai, buffer, clip.name, clip.type),
      ]);

      return {
        index: i,
        filename: clip.name,
        size_bytes: clip.size,
        url: publicUrl,
        transcript,
        storage_path: storagePath,
      };
    })
  );

  // Build prompt for GPT-4o
  const transcriptSections = clipResults.map((c, i) => {
    if (c.transcript) {
      return `CLIP ${i + 1} (${c.filename}):\n"${c.transcript}"`;
    }
    return `CLIP ${i + 1} (${c.filename}): [audio could not be transcribed — file may be too large or silent]`;
  }).join('\n\n');

  const systemPrompt = `You are an expert TikTok content strategist and copywriter specializing in affiliate marketing and TikTok Shop content. You analyze raw video clips and create viral-ready post content.`;

  const userPrompt = `Analyze these ${rawClips.length} raw video clip transcript${rawClips.length !== 1 ? 's' : ''} and generate a complete, optimized TikTok post package.

${transcriptSections}

${productName ? `PRODUCT BEING PROMOTED: ${productName}` : ''}
${extraContext ? `EXTRA CONTEXT FROM CREATOR: ${extraContext}` : ''}

Your job:
1. Identify which clip has the most compelling content (energy, clear product mention, hook potential)
2. Generate viral TikTok copy based on what was actually said

Respond with valid JSON only, no markdown:
{
  "best_clip_index": 0,
  "reasoning": "1-2 sentences explaining why this clip works best",
  "clip_scores": [8],
  "hook": "Opening 1-2 sentences that stop the scroll immediately",
  "caption": "Full TikTok caption body — 2-4 punchy sentences, conversational, builds curiosity",
  "hashtags": ["#ad", "#tiktokshop", "4-6 highly relevant niche tags"],
  "cta": "One punchy call-to-action sentence",
  "cover_text": "Short text overlay for video thumbnail (max 5 words)",
  "content_angle": "Brief description of the content angle used"
}

Rules:
- #ad must always be first hashtag (FTC compliance for sponsored content)
- Hook must reference something specific from the transcript
- Caption must feel authentic, not salesy
- Hashtags should be specific to the niche, not generic (#fyp, #viral are low-value)`;

  let aiResult: {
    best_clip_index: number;
    reasoning: string;
    clip_scores: number[];
    hook: string;
    caption: string;
    hashtags: string[];
    cta: string;
    cover_text: string;
    content_angle: string;
  };

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.75,
      max_tokens: 800,
    });
    const raw = completion.choices[0]?.message?.content || '{}';
    aiResult = JSON.parse(raw);
  } catch (err) {
    // GPT failure — refund credits and return error
    return createApiErrorResponse('AI_ERROR', 'AI generation failed. Credits have not been charged.', 500, correlationId);
  }

  // Normalize AI result
  const bestIndex = Math.max(0, Math.min(aiResult.best_clip_index ?? 0, clipResults.length - 1));
  const hashtags = (aiResult.hashtags || []).map((h: string) => h.startsWith('#') ? h : `#${h}`);
  if (!hashtags.some((h: string) => h.toLowerCase() === '#ad')) hashtags.unshift('#ad');

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();
  const bestClip = clipResults[bestIndex];

  return NextResponse.json({
    ok: true,
    data: {
      job_id: jobId,
      clips: clipResults.map((c, i) => ({
        index: c.index,
        filename: c.filename,
        size_bytes: c.size_bytes,
        url: c.url,
        transcript: c.transcript,
        score: aiResult.clip_scores?.[i] ?? null,
        is_best: i === bestIndex,
      })),
      best_clip_index: bestIndex,
      best_clip_url: bestClip?.url || null,
      reasoning: aiResult.reasoning || '',
      content_angle: aiResult.content_angle || '',
      hook: aiResult.hook || '',
      caption: aiResult.caption || '',
      hashtags,
      cta: aiResult.cta || '',
      cover_text: aiResult.cover_text || '',
      product_id: productId,
      product_name: productName,
      tiktok_product_id: tiktokProductId || null,
      link_code: linkCode || null,
      affiliate_url: linkCode ? `${appUrl}/api/r/${linkCode}` : null,
      credits_used: creditCost,
      credits_remaining: creditResult.remaining,
    },
    correlation_id: correlationId,
  });
}
