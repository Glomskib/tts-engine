/**
 * /api/avatars/[id]/scripts
 *   GET — list scripts for this avatar
 *   POST — batch-generate N scripts in this avatar's voice
 *
 * POST body: {
 *   product_name: string,
 *   product_brief?: string,
 *   types: { kind: '15s'|'30s'|'60s'|'objection'|'founder'|'comparison'|'tts-shop'|'comment-reply', count: number }[],
 *   campaign_id?: string,
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface ScriptOut {
  script_type: string;
  hook: string;
  body: string;
  cta: string;
  captions: string;
  hashtags: string;
  scene_tag?: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const url = new URL(req.url);
  const campaignId = url.searchParams.get('campaign_id');

  let query = supabaseAdmin
    .from('avatar_scripts')
    .select('id, script_type, hook, body, cta, captions, hashtags, status, compliance_flags, render_video_url, created_at, campaign_id')
    .eq('user_id', auth.user.id)
    .eq('brand_profile_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (campaignId) query = query.eq('campaign_id', campaignId);

  const { data, error } = await query;
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true, scripts: data || [], correlation_id: correlationId });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  const userId = auth.user.id;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG_ERROR', 'ANTHROPIC_API_KEY missing', 503, correlationId);

  const { data: avatar } = await supabaseAdmin
    .from('brand_profiles')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  let body: { product_name?: string; product_brief?: string; types?: { kind: string; count: number }[]; campaign_id?: string };
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const productName = (body.product_name || '').trim().slice(0, 200);
  if (!productName) return createApiErrorResponse('VALIDATION_ERROR', 'product_name required', 400, correlationId);

  const types = (body.types || [{ kind: '30s', count: 5 }])
    .filter(t => t && typeof t.kind === 'string')
    .map(t => ({ kind: t.kind.slice(0, 40), count: Math.max(1, Math.min(20, Number(t.count) || 1)) }));

  const totalRequested = types.reduce((a, t) => a + t.count, 0);
  if (totalRequested > 50) return createApiErrorResponse('VALIDATION_ERROR', 'Max 50 scripts per batch', 400, correlationId);

  // Build the Claude prompt — bake avatar tone, prohibited claims, knowledge bank in
  const kb = (avatar.knowledge_bank as Record<string, unknown>) || {};
  const allowedClaims = (kb.allowed_claims as string[] | undefined) || [];
  const prohibitedClaims = (kb.prohibited_claims as string[] | undefined) || [];
  const objections = (kb.common_objections as string[] | undefined) || [];

  const systemPrompt = `You are the script writer for an AI avatar brand spokesperson.
Avatar name: ${avatar.avatar_display_name || avatar.name}
Personality: ${avatar.personality || avatar.tone_descriptor || 'friendly, conversational'}
Niche: ${avatar.niche || 'general'}
Target audience: ${avatar.target_audience || 'short-form viewers'}

VOICE RULES (must follow every time):
- Tone descriptor: ${avatar.tone_descriptor || 'plain talk, friend-to-friend'}
- Preferred phrases: ${avatar.preferred_phrases || '(none specified)'}
- PROHIBITED phrases (never use): ${avatar.prohibited_phrases || '(none specified)'}
- Allowed claim language: ${allowedClaims.join('; ') || '(use only general lifestyle/use-case language)'}
- PROHIBITED claim language (never use): ${prohibitedClaims.join('; ') || '(default health claims forbidden: cure, treat, prevent, diagnose, guaranteed)'}

OUTPUT: a JSON array. Each item: { "script_type": "<kind>", "hook": "<10-15 word opener>", "body": "<full script>", "cta": "<single line>", "captions": "<karaoke-style on-screen captions>", "hashtags": "<6-10 hashtags space-separated>", "scene_tag": "<one of: kitchen|desk|outdoors|cafe|studio|gym|car|walking|product|selfie — pick what best matches the script setting>" }

Do NOT wrap in markdown. Output raw JSON array only.`;

  const userPrompt = `Product: ${productName}
${body.product_brief ? 'Brief: ' + body.product_brief : ''}
${objections.length ? 'Common objections to address: ' + objections.join('; ') : ''}

Generate exactly:
${types.map(t => `- ${t.count} × "${t.kind}" scripts`).join('\n')}

Each script must feel like the same person (${avatar.avatar_display_name || avatar.name}) talking. Vary the angle/hook between scripts but never the voice.`;

  let scripts: ScriptOut[] = [];
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = msg.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n').trim();
    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    scripts = JSON.parse(cleaned);
    if (!Array.isArray(scripts)) throw new Error('Claude did not return an array');
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : 'Claude call failed';
    return createApiErrorResponse('AI_ERROR', m, 502, correlationId);
  }

  // Insert each script
  const rows = scripts.slice(0, 50).map(s => ({
    user_id: userId,
    brand_profile_id: id,
    campaign_id: body.campaign_id || null,
    script_type: String(s.script_type || 'unknown').slice(0, 40),
    hook: String(s.hook || '').slice(0, 500),
    body: String(s.body || '').slice(0, 5000),
    cta: String(s.cta || '').slice(0, 500),
    captions: String(s.captions || '').slice(0, 2000),
    hashtags: String(s.hashtags || '').slice(0, 500),
    scene_tag: s.scene_tag ? String(s.scene_tag).slice(0, 40) : null,
    source: 'avatar-batch',
    source_prompt: productName,
  }));

  const { data, error } = await supabaseAdmin
    .from('avatar_scripts')
    .insert(rows)
    .select('id, script_type, hook, body, cta, captions, hashtags');
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  return NextResponse.json({ ok: true, scripts: data || [], correlation_id: correlationId });
}
