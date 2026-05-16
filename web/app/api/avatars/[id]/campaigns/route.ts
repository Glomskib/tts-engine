/**
 * /api/avatars/[id]/campaigns
 *   GET — list this avatar's campaigns
 *   POST — generate a multi-week structured campaign
 *
 * POST body: {
 *   name: string, product_name: string, product_brief?: string,
 *   goal: 'awareness'|'sales'|'launch', duration_days: 7|14|30
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const { data, error } = await supabaseAdmin
    .from('avatar_campaigns')
    .select('id, name, product_name, goal, duration_days, status, created_at')
    .eq('user_id', auth.user.id)
    .eq('brand_profile_id', id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  return NextResponse.json({ ok: true, campaigns: data || [], correlation_id: correlationId });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG_ERROR', 'ANTHROPIC_API_KEY missing', 503, correlationId);

  const { data: avatar } = await supabaseAdmin
    .from('brand_profiles')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!avatar) return createApiErrorResponse('NOT_FOUND', 'avatar not found', 404, correlationId);

  let body: { name?: string; product_name?: string; product_brief?: string; goal?: string; duration_days?: number };
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const product = (body.product_name || '').trim().slice(0, 200);
  const duration = [7, 14, 30].includes(Number(body.duration_days)) ? Number(body.duration_days) : 30;
  const goal = ['awareness','sales','launch'].includes(body.goal || '') ? body.goal! : 'awareness';
  const name = (body.name || `${product} — ${duration}-day ${goal}`).slice(0, 200);
  if (!product) return createApiErrorResponse('VALIDATION_ERROR', 'product_name required', 400, correlationId);

  const systemPrompt = `Plan a ${duration}-day short-form content campaign for an AI avatar brand spokesperson.
Avatar: ${avatar.avatar_display_name || avatar.name}
Personality: ${avatar.personality || 'friendly, conversational'}
Voice rules: ${avatar.tone_descriptor || 'plain talk'}
Prohibited language: ${avatar.prohibited_phrases || 'no medical claims'}

Structure: week 1 awareness, week 2 education, week 3 objection handling, week 4 conversion (scale to ${duration} days).
Each day must have: hook_idea (10-15 words), script_brief (2-3 sentences), cta_style, hashtag_theme.

Output a JSON object: { "weeks": [ { "week": 1, "theme": "...", "days": [ { "day": 1, "hook_idea": "...", "script_brief": "...", "cta_style": "...", "hashtag_theme": "..." } ] } ] }`;
  const userPrompt = `Product: ${product}
${body.product_brief ? 'Brief: ' + body.product_brief : ''}
Goal: ${goal}
Duration: ${duration} days
Plan the campaign now.`;

  let structure: Record<string, unknown> = {};
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = msg.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    structure = JSON.parse(cleaned);
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : 'Claude call failed';
    return createApiErrorResponse('AI_ERROR', m, 502, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('avatar_campaigns')
    .insert({
      user_id: auth.user.id,
      brand_profile_id: id,
      name,
      product_name: product,
      product_brief: body.product_brief || null,
      goal,
      duration_days: duration,
      structure,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  return NextResponse.json({ ok: true, campaign_id: data.id, structure, correlation_id: correlationId });
}
