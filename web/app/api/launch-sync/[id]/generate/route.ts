/**
 * POST /api/launch-sync/[id]/generate
 *
 * AI-generates hooks, scripts, angles, and a creator brief for a launch.
 * Uses the product info + any existing context to produce ready-to-use content seeds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { callAnthropicJSON } from '@/lib/ai/anthropic';

export const runtime = 'nodejs';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const correlationId = generateCorrelationId();
  const { user } = await getApiAuthContext(request);
  if (!user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);

  const { id } = await ctx.params;

  // Fetch the launch + product info
  const { data: launch, error } = await supabaseAdmin
    .from('product_launches')
    .select('*, products(name, brand, category, notes, pain_points, primary_link)')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (error || !launch) return createApiErrorResponse('NOT_FOUND', 'Launch not found', 404, correlationId);

  // Mark as generating
  await supabaseAdmin
    .from('product_launches')
    .update({ status: 'generating' })
    .eq('id', id);

  const productName = launch.products?.name || launch.title;
  const productCategory = launch.products?.category || 'general';
  const productNotes = launch.products?.notes || '';
  const painPoints = launch.products?.pain_points || [];
  const productLink = launch.source_url || launch.products?.primary_link || '';

  const prompt = `You are a TikTok content strategist helping launch a product. Generate content seeds for this product launch.

Product: ${productName}
Category: ${productCategory}
${productNotes ? `Notes: ${productNotes}` : ''}
${painPoints.length ? `Pain Points: ${JSON.stringify(painPoints)}` : ''}
${productLink ? `Product Link: ${productLink}` : ''}
${launch.asin ? `Amazon ASIN: ${launch.asin}` : ''}
Launch Mode: ${launch.mode} (${launch.mode === 'agency' ? 'multiple creators/affiliates' : 'solo creator'})
Target Videos: ${launch.target_videos}

Generate the following as JSON:

{
  "hooks": [
    {"text": "hook text", "angle": "angle name", "style": "educational|shock|relatable|storytime|pov"}
  ],
  "scripts": [
    {"title": "short title", "hook": "opening hook", "body": "3-5 sentence body with visual direction", "cta": "call to action", "tone": "energetic|calm|funny|serious|relatable"}
  ],
  "angles": [
    {"angle": "angle name", "description": "1-2 sentence description of this content angle"}
  ],
  "creator_brief": "A comprehensive creator brief that any affiliate or creator could use to make content for this product. Include key selling points, what to show, what to avoid, and tone guidance."
}

Rules:
- Generate 5 hooks with different angles and styles
- Generate 3 complete scripts (30-60 second TikTok format)
- Generate 4 content angles
- Make the creator brief detailed enough for an affiliate who has never seen the product
- Focus on what actually works on TikTok — pattern interrupts, curiosity gaps, relatable pain points
- Be specific about visual direction in scripts
- Keep CTAs natural, not salesy

Return ONLY valid JSON, no markdown or explanation.`;

  try {
    const { parsed } = await callAnthropicJSON<{
      hooks: { text: string; angle: string; style: string }[];
      scripts: { title: string; hook: string; body: string; cta: string; tone: string }[];
      angles: { angle: string; description: string }[];
      creator_brief: string;
    }>(prompt, {
      maxTokens: 3000,
      agentId: 'launch-sync-generate',
      correlationId,
    });

    // Update launch with generated content
    await supabaseAdmin
      .from('product_launches')
      .update({
        hooks: parsed.hooks || [],
        scripts: parsed.scripts || [],
        angles: parsed.angles || [],
        creator_brief: parsed.creator_brief || null,
        status: 'ready',
      })
      .eq('id', id);

    // Auto-create content items from scripts
    const contentItems = (parsed.scripts || []).map((script: any) => ({
      launch_id: id,
      workspace_id: user.id,
      title: script.title,
      hook_text: script.hook,
      script_text: `${script.hook}\n\n${script.body}\n\n${script.cta}`,
      status: 'script_ready',
    }));

    if (contentItems.length) {
      await supabaseAdmin.from('launch_content').insert(contentItems);
    }

    return NextResponse.json({
      ok: true,
      data: {
        hooks: parsed.hooks,
        scripts: parsed.scripts,
        angles: parsed.angles,
        creator_brief: parsed.creator_brief,
        content_created: contentItems.length,
      },
      correlation_id: correlationId,
    });
  } catch (err: any) {
    // Revert status on failure
    await supabaseAdmin
      .from('product_launches')
      .update({ status: 'draft' })
      .eq('id', id);

    return createApiErrorResponse('AI_ERROR', err.message || 'AI generation failed', 500, correlationId);
  }
}
