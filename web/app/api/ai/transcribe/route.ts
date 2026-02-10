import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { z } from 'zod';

export const runtime = 'nodejs';

const TranscribeSchema = z.object({
  tiktok_url: z.string().url(),
  title: z.string().optional(),
  author: z.string().optional(),
  use_title_as_script: z.boolean().default(false),
  brand_context: z.string().optional(),
  product_context: z.string().optional(),
});

/**
 * POST /api/ai/transcribe
 * Generate a likely video script/hook from TikTok metadata using AI.
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const parsed = TranscribeSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { tiktok_url, title, author, use_title_as_script, brand_context, product_context } = parsed.data;

  // If use_title_as_script, return title directly as hook
  if (use_title_as_script && title) {
    return NextResponse.json({
      ok: true,
      data: {
        transcript: title,
        hook: title,
        scenes: [],
        summary: `Title used as script: "${title}"`,
      },
      correlation_id: correlationId,
    });
  }

  // Fetch oEmbed if no title provided
  let videoTitle = title || '';
  let videoAuthor = author || '';

  if (!videoTitle) {
    try {
      const oembedRes = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(tiktok_url)}`
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        videoTitle = oembed.title || '';
        videoAuthor = oembed.author_name || videoAuthor;
      }
    } catch {
      // Continue without oEmbed data
    }
  }

  if (!videoTitle) {
    return createApiErrorResponse(
      'BAD_REQUEST',
      'Could not determine video title. Please provide the title parameter.',
      400,
      correlationId
    );
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return createApiErrorResponse('INTERNAL', 'AI service not configured', 500, correlationId);
    }

    const systemPrompt = `You are a TikTok content analyst. Given a TikTok video title/description and context, reconstruct the likely video script including spoken hook, scene-by-scene breakdown, and CTA.

Format your response as JSON with this structure:
{
  "hook": "The opening spoken line/hook",
  "scenes": [
    { "timestamp": "0-3s", "action": "Description of what happens", "dialogue": "Spoken words if any", "on_screen_text": "Text overlay if any" }
  ],
  "cta": "The call to action",
  "summary": "Brief summary of the video concept"
}

Be specific and actionable. If the title suggests a skit, write it as a skit. If it's a product review, structure it as a review.`;

    const userPrompt = `Reconstruct the likely TikTok video script from this information:

Title/Description: "${videoTitle}"
Creator: @${videoAuthor}
URL: ${tiktok_url}
${brand_context ? `Brand context: ${brand_context}` : ''}
${product_context ? `Product context: ${product_context}` : ''}

Generate the most likely script structure with hook, scenes, and CTA.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[${correlationId}] Anthropic API error:`, errText);
      return createApiErrorResponse('INTERNAL', 'AI transcription failed', 500, correlationId);
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text || '';

    // Parse JSON from AI response
    let scriptData: { hook: string; scenes: unknown[]; cta?: string; summary: string };
    try {
      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      scriptData = jsonMatch ? JSON.parse(jsonMatch[0]) : { hook: videoTitle, scenes: [], summary: content };
    } catch {
      scriptData = {
        hook: videoTitle,
        scenes: [],
        summary: content,
      };
    }

    const fullTranscript = [
      `[HOOK] ${scriptData.hook}`,
      ...(scriptData.scenes as Array<{ timestamp?: string; action?: string; dialogue?: string }>).map(
        (s, i) => `[SCENE ${i + 1}${s.timestamp ? ` ${s.timestamp}` : ''}] ${s.action || ''}${s.dialogue ? `\nDialogue: "${s.dialogue}"` : ''}`
      ),
      scriptData.cta ? `[CTA] ${scriptData.cta}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = NextResponse.json({
      ok: true,
      data: {
        transcript: fullTranscript,
        hook: scriptData.hook,
        scenes: scriptData.scenes,
        cta: scriptData.cta || '',
        summary: scriptData.summary,
      },
      correlation_id: correlationId,
    });
    result.headers.set('x-correlation-id', correlationId);
    return result;
  } catch (error) {
    console.error(`[${correlationId}] Transcription error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Transcription failed',
      500,
      correlationId
    );
  }
}
