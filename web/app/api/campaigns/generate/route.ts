/**
 * POST /api/campaigns/generate
 *
 * Generate a full campaign: experiment + hooks + concepts + scripts + content items.
 * This is the main entry point for the auto campaign generator.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCampaign } from '@/lib/campaigns/generate-campaign';
import { MAX_MATRIX_SIZE, MAX_HOOKS_PER_COMBO, MAX_PERSONAS, MAX_ANGLES } from '@/lib/campaigns/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes — campaign generation is long-running

export async function POST(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  const { name, brand_id, product_id, hooks_per_combo, persona_ids, angles, platform } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 });
  }
  if (!brand_id || typeof brand_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'brand_id is required' }, { status: 400 });
  }
  if (!product_id || typeof product_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'product_id is required' }, { status: 400 });
  }
  if (!Array.isArray(persona_ids) || persona_ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'At least one persona is required' }, { status: 400 });
  }
  if (persona_ids.length > MAX_PERSONAS) {
    return NextResponse.json({ ok: false, error: `Maximum ${MAX_PERSONAS} personas per campaign` }, { status: 400 });
  }
  if (!Array.isArray(angles) || angles.length === 0) {
    return NextResponse.json({ ok: false, error: 'At least one angle is required' }, { status: 400 });
  }
  if (angles.length > MAX_ANGLES) {
    return NextResponse.json({ ok: false, error: `Maximum ${MAX_ANGLES} angles per campaign` }, { status: 400 });
  }

  const hooksPerCombo = typeof hooks_per_combo === 'number' ? hooks_per_combo : 3;
  if (hooksPerCombo < 1 || hooksPerCombo > MAX_HOOKS_PER_COMBO) {
    return NextResponse.json({ ok: false, error: `hooks_per_combo must be 1-${MAX_HOOKS_PER_COMBO}` }, { status: 400 });
  }

  // Check matrix size
  const matrixSize = persona_ids.length * angles.length * hooksPerCombo;
  if (matrixSize > MAX_MATRIX_SIZE) {
    return NextResponse.json({
      ok: false,
      error: `Campaign would generate ${matrixSize} hooks (max ${MAX_MATRIX_SIZE}). Reduce personas, angles, or hooks per combo.`,
    }, { status: 400 });
  }

  const validPlatforms = ['tiktok', 'instagram_reels', 'youtube_shorts'];
  const validPlatform = validPlatforms.includes(platform as string) ? platform as 'tiktok' | 'instagram_reels' | 'youtube_shorts' : 'tiktok';

  try {
    const result = await generateCampaign({
      name: (name as string).trim(),
      brand_id: brand_id as string,
      product_id: product_id as string,
      goal: typeof body.goal === 'string' ? body.goal : undefined,
      hooks_per_combo: hooksPerCombo,
      persona_ids: persona_ids as string[],
      angles: angles as string[],
      platform: validPlatform,
      tone: typeof body.tone === 'string' ? body.tone : undefined,
      cta_style: typeof body.cta_style === 'string' ? body.cta_style : undefined,
      auto_script: body.auto_script !== false, // default true
      auto_content_items: body.auto_content_items !== false, // default true
    }, auth.user.id);

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error('Campaign generation error:', err);
    return NextResponse.json({ ok: false, error: `Campaign generation failed: ${String(err)}` }, { status: 500 });
  }
}
