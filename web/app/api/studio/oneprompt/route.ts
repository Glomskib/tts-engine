/**
 * POST /api/studio/oneprompt — the "one prompt, finished video" orchestrator.
 *
 * Body: { prompt: string, avatar_id?: string, product_name?: string }
 *
 * Returns: { ok, job_id } — UI polls /api/studio/oneprompt?job_id=<id>
 *
 * Pipeline:
 *   1. parse_intent (Claude)
 *   2. resolve_avatar (existing match or user-picked)
 *   3. generate_script (Claude with avatar voice locked)
 *   4. queue_render (HeyGen — kicked async, job written for poller)
 *   5. compose (FlashFlow editor adds captions/B-roll/music)
 *   6. final_publish (output stored on script row)
 *
 * Steps 4-6 actually run in the cron worker (video-engine-tick).
 * This endpoint kicks off the job and returns immediately.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Intent {
  avatar_persona: string;
  product_name: string;
  format: '15s' | '30s' | '60s';
  angle: string;
  cta_style: string;
}

async function parseIntent(apiKey: string, prompt: string): Promise<Intent> {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    system: 'Parse the user prompt into a structured JSON intent for short-form video creation. Output ONLY raw JSON: {"avatar_persona":"...","product_name":"...","format":"15s|30s|60s","angle":"...","cta_style":"..."}. No markdown.',
    messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

export async function GET(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const url = new URL(req.url);
  const jobId = url.searchParams.get('job_id');
  if (!jobId) {
    // list user's recent oneprompt jobs
    const { data } = await supabaseAdmin
      .from('generation_jobs')
      .select('id, prompt, step, status, progress, output, created_at')
      .eq('user_id', auth.user.id)
      .eq('kind', 'oneprompt')
      .order('created_at', { ascending: false })
      .limit(20);
    return NextResponse.json({ ok: true, jobs: data || [] });
  }

  const { data } = await supabaseAdmin
    .from('generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!data) return createApiErrorResponse('NOT_FOUND', 'job not found', 404, correlationId);
  return NextResponse.json({ ok: true, job: data });
}

export async function POST(req: NextRequest) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return createApiErrorResponse('CONFIG_ERROR', 'ANTHROPIC_API_KEY missing', 503, correlationId);

  let body: { prompt?: string; avatar_id?: string; product_name?: string };
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const prompt = (body.prompt || '').trim();
  if (!prompt) return createApiErrorResponse('VALIDATION_ERROR', 'prompt required', 400, correlationId);

  // Step 1: parse intent
  let intent: Intent;
  try {
    intent = await parseIntent(apiKey, prompt);
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : 'intent parse failed';
    return createApiErrorResponse('AI_ERROR', m, 502, correlationId);
  }

  // Step 2: resolve avatar
  let avatarId = body.avatar_id;
  if (!avatarId) {
    const { data: matches } = await supabaseAdmin
      .from('brand_profiles')
      .select('id, avatar_display_name, niche, personality')
      .eq('user_id', auth.user.id)
      .eq('is_avatar', true)
      .eq('active', true);
    if (!matches || matches.length === 0) {
      return createApiErrorResponse('PRECONDITION_FAILED', 'No avatars yet — create one at /avatars first', 400, correlationId);
    }
    // simple: pick first avatar whose niche/personality includes any keyword from intent.avatar_persona
    const persona = intent.avatar_persona?.toLowerCase() || '';
    const best = matches.find(m => {
      const blob = `${m.niche || ''} ${m.personality || ''} ${m.avatar_display_name || ''}`.toLowerCase();
      return persona.split(/\s+/).some(w => w.length > 3 && blob.includes(w));
    });
    avatarId = (best || matches[0]).id;
  }

  // Step 3: create the generation_job row — worker (or chained step) advances it
  const { data: job, error } = await supabaseAdmin
    .from('generation_jobs')
    .insert({
      user_id: auth.user.id,
      kind: 'oneprompt',
      prompt,
      brand_profile_id: avatarId,
      step: 'parse_intent_done',
      steps_done: ['parse_intent'],
      status: 'running',
      progress: 10,
      output: { intent, resolved_avatar_id: avatarId },
    })
    .select('id')
    .single();
  if (error) return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);

  // The worker (video-engine-tick) will:
  //   - read generation_jobs where status='running' and kind='oneprompt'
  //   - run the script gen via /api/avatars/[id]/scripts internally
  //   - kick HeyGen render
  //   - wait for render webhook
  //   - kick FlashFlow editor on the render result
  //   - update generation_jobs.output with final video_url

  return NextResponse.json({
    ok: true,
    job_id: job.id,
    intent,
    resolved_avatar_id: avatarId,
    correlation_id: correlationId,
  });
}
