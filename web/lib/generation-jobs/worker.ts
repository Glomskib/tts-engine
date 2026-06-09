/**
 * generation_jobs worker — advances oneprompt jobs created by
 * /api/studio/oneprompt and the "Make this video" button.
 *
 * Why this exists: tickActiveRuns() in @/lib/video-engine/pipeline only
 * processes the ve_runs table (clip editing). The oneprompt + script
 * render flow writes to generation_jobs instead, and no worker was ever
 * built for it — jobs stuck at progress:10 forever. Brandon's smoke test
 * caught this. Without this worker, no avatar video gen completes.
 *
 * State machine (kind='oneprompt'):
 *   parse_intent_done (10%)  → script_done (50%)        — generate script
 *   script_done (50%)        → render_queued (70%)      — kick HeyGen (if configured)
 *                              OR  → complete (100%)    — if no HEYGEN_API_KEY, ship the script
 *   render_queued (70%)      → complete (100%)          — poll HeyGen, store video_url
 *
 * Errors at any step mark the job status='failed' with error_message.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface GenJob {
  id: string;
  user_id: string;
  kind: string;
  prompt: string;
  brand_profile_id: string | null;
  step: string;
  steps_done: string[] | null;
  status: string;
  progress: number;
  output: Record<string, unknown> | null;
}

export interface TickResult {
  jobId: string;
  from: string;
  to: string;
  ok: boolean;
  error?: string;
}

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

export async function tickGenerationJobs(max = 2): Promise<TickResult[]> {
  // Find non-terminal oneprompt jobs ordered by oldest first.
  const { data: candidates, error: candErr } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, step, status, updated_at')
    .eq('kind', 'oneprompt')
    .eq('status', 'running')
    .not('step', 'in', '(complete,failed)')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(max * 2);

  if (candErr) {
    console.error('[gen-jobs-worker] query failed:', candErr.message);
    return [];
  }
  if (!candidates || candidates.length === 0) return [];

  // Process up to `max` — no formal claim; the rate limit on /api/worker/tick
  // (3s/user) plus monotonic step advancement makes double-processing harmless.
  const results: TickResult[] = [];
  for (const c of candidates) {
    if (results.length >= max) break;
    try {
      results.push(await advanceJob(c.id as string));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ jobId: c.id as string, from: '?', to: 'failed', ok: false, error: msg });
    }
  }
  return results;
}

async function advanceJob(jobId: string): Promise<TickResult> {
  const { data: row, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, user_id, kind, prompt, brand_profile_id, step, steps_done, status, progress, output')
    .eq('id', jobId)
    .single();
  if (error || !row) {
    return { jobId, from: '?', to: 'failed', ok: false, error: 'job not found' };
  }
  const job = row as GenJob;
  const from = job.step;
  const output = (job.output ?? {}) as Record<string, unknown>;

  try {
    let to: string = from;
    let progress = job.progress;
    let status: 'running' | 'complete' | 'failed' = 'running';

    if (from === 'parse_intent_done') {
      // Step 2: generate script
      const scriptText = await generateScriptInline(job);
      output.script_text = scriptText;
      output.script_generated_at = new Date().toISOString();
      to = 'script_done';
      progress = 50;
    } else if (from === 'script_done') {
      const heygenKey = process.env.HEYGEN_API_KEY;
      if (!heygenKey) {
        // No HeyGen configured — ship the script as the deliverable.
        // User gets a usable result instead of stuck at 50%.
        output.video_url = null;
        output.note = 'Script ready. Video render skipped — HeyGen API key not configured.';
        to = 'complete';
        progress = 100;
        status = 'complete';
      } else {
        // Kick HeyGen avatar render
        try {
          const heygenId = await kickHeygen(job, String(output.script_text ?? ''));
          output.heygen_video_id = heygenId;
          output.heygen_kicked_at = new Date().toISOString();
          to = 'render_queued';
          progress = 70;
        } catch (e) {
          // HeyGen failed — fall back to script-only delivery so user
          // still gets value
          const msg = e instanceof Error ? e.message : String(e);
          output.heygen_error = msg;
          output.video_url = null;
          output.note = `Script ready. Video render failed: ${msg.slice(0, 200)}`;
          to = 'complete';
          progress = 100;
          status = 'complete';
        }
      }
    } else if (from === 'render_queued') {
      // Poll HeyGen for completion
      const heygenId = String(output.heygen_video_id ?? '');
      if (!heygenId) {
        throw new Error('render_queued without heygen_video_id');
      }
      const poll = await pollHeygen(heygenId);
      if (poll.done && poll.url) {
        output.video_url = poll.url;
        output.completed_at = new Date().toISOString();
        to = 'complete';
        progress = 100;
        status = 'complete';
      } else if (poll.failed) {
        throw new Error(poll.error || 'HeyGen render failed');
      } else {
        // Still rendering — bump last_tick_at so we don't immediately re-claim
        await supabaseAdmin
          .from('generation_jobs')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', jobId);
        return { jobId, from, to: from, ok: true };
      }
    } else {
      return { jobId, from, to: from, ok: true };
    }

    const newSteps = Array.from(new Set([...(job.steps_done || []), from.replace(/_done$/, '')]));
    const patch: Record<string, unknown> = {
      step: to,
      steps_done: newSteps,
      status,
      progress,
      output,
      updated_at: new Date().toISOString(),
    };
    await supabaseAdmin.from('generation_jobs').update(patch).eq('id', jobId);

    return { jobId, from, to, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 2026-06-09: classify the error into something USER-actionable instead
    // of dumping raw API output. Two big categories cause >80% of failures
    // in practice (verified by live test):
    //   1. External billing (HeyGen out of API credits, Anthropic out of
    //      api credits) — user can't fix from in-app; tell them where to go
    //   2. Content moderation (NSFW, prohibited niche) — user should rewrite
    // Everything else falls back to a generic but human message.
    const friendly = classifyOnepromptError(msg);
    // 2026-06-09: also write to error_message column (not just output.error)
    // so the /studio/oneprompt page can show a clear failure banner. Without
    // this, the failure was silent — page kept polling forever showing
    // "Reading the prompt" in green while the row was actually 'failed'.
    await supabaseAdmin
      .from('generation_jobs')
      .update({
        status: 'failed',
        step: 'failed',
        progress: 100,
        error_message: friendly.slice(0, 1000),
        output: { ...output, error: msg.slice(0, 1000), error_friendly: friendly },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return { jobId, from, to: 'failed', ok: false, error: friendly };
  }
}

/**
 * Turn raw API errors into actionable user-facing copy.
 *
 * Pattern-matches the strings we've seen in live failures and rewrites them
 * so users know WHAT to do next instead of staring at "Insufficient credit.
 * This operation requires 'api' credits." with no context for who needs to
 * fix what.
 */
function classifyOnepromptError(raw: string): string {
  const lower = raw.toLowerCase();

  // HeyGen API credit exhaustion — distinct from FlashFlow's own credit system.
  // HeyGen sells API credits separately from UI credits on every plan tier.
  if (lower.includes("requires 'api' credits") || lower.includes('requires "api" credits') ||
      (lower.includes('insufficient credit') && lower.includes('api'))) {
    return 'HeyGen ran out of API render credits. The avatar video step needs HeyGen API credits — top up at https://app.heygen.com/settings/subscription then try again. Your FlashFlow credits were not charged.';
  }

  // Anthropic / Claude billing wall
  if (lower.includes('credit balance is too low') ||
      (lower.includes('anthropic') && lower.includes('credit'))) {
    return 'The script-writing AI account ran out of credit. Contact support — we top this up centrally so users never see this.';
  }

  // HeyGen plan tier / photo avatar restriction
  if (lower.includes('exceeded your limit of') && lower.includes('photo avatar')) {
    return 'HeyGen plan cap reached on photo avatars. Either delete an unused avatar at heygen.com or upgrade your HeyGen plan, then try again.';
  }

  // HeyGen 403 / tier restriction in general
  if (lower.includes('403') && (lower.includes('heygen') || lower.includes('tier') || lower.includes('plan'))) {
    return 'HeyGen rejected this on your current plan tier. Upgrade your HeyGen plan or contact support if you think this is a mistake.';
  }

  // Content moderation
  if (lower.includes('moderation') || lower.includes('content policy') || lower.includes('safety') ||
      lower.includes('prohibited') || lower.includes('nsfw')) {
    return 'The prompt was flagged by content moderation. Rephrase to be more direct + family-friendly and try again.';
  }

  // Rate limit
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) {
    return 'Hit a temporary rate limit. Wait 30 seconds and try again — if it persists, contact support.';
  }

  // Network / timeout
  if (lower.includes('timeout') || lower.includes('econnreset') || lower.includes('socket hang up')) {
    return 'A network step timed out partway through. Try again — most reruns succeed.';
  }

  // Default: surface the raw error but with a clean prefix so the user
  // knows it's not a generic outage.
  return `Something went wrong during generation: ${raw.slice(0, 300)}`;
}

async function generateScriptInline(job: GenJob): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');

  let avatarContext = '';
  if (job.brand_profile_id) {
    const { data: avatar } = await supabaseAdmin
      .from('brand_profiles')
      .select('avatar_display_name, niche, personality, tone_descriptor, target_audience, prohibited_phrases, preferred_phrases')
      .eq('id', job.brand_profile_id)
      .single();
    if (avatar) {
      avatarContext =
        `Avatar persona: ${avatar.avatar_display_name || 'Unnamed'}\n` +
        (avatar.niche ? `Niche: ${avatar.niche}\n` : '') +
        (avatar.personality ? `Personality: ${avatar.personality}\n` : '') +
        (avatar.tone_descriptor ? `Tone: ${avatar.tone_descriptor}\n` : '') +
        (avatar.target_audience ? `Target audience: ${avatar.target_audience}\n` : '') +
        (avatar.preferred_phrases ? `Preferred phrases: ${avatar.preferred_phrases}\n` : '') +
        (avatar.prohibited_phrases ? `Never say: ${avatar.prohibited_phrases}\n` : '');
    }
  }

  const intent = ((job.output ?? {}) as { intent?: Record<string, unknown> }).intent ?? {};
  const format = (intent.format as string) || '30s';
  const productName = (intent.product_name as string) || '';
  const angle = (intent.angle as string) || '';
  const ctaStyle = (intent.cta_style as string) || 'soft';
  const wordTarget = format === '15s' ? '~45 words' : format === '60s' ? '~150 words' : '~85 words';

  const userPrompt = job.prompt;

  const prompt =
    `Write a complete TikTok ${format} video script.\n\n` +
    `${avatarContext}\n` +
    `User's request: ${userPrompt}\n` +
    (productName ? `Product: ${productName}\n` : '') +
    (angle ? `Angle: ${angle}\n` : '') +
    (ctaStyle ? `CTA style: ${ctaStyle}\n` : '') +
    `\nRequirements:\n` +
    `- Match the avatar's voice, tone, and personality exactly\n` +
    `- Hook within the first 3 seconds (something that makes scrollers stop)\n` +
    `- Clear, on-brand CTA at the end\n` +
    `- No medical claims; no "guaranteed", "cure", "treat", "diagnose"\n` +
    `- Target length: ${wordTarget}\n` +
    `\nReturn ONLY the spoken script text. No headings, no markdown, no JSON. ` +
    `Just what the avatar says, in plain text, line by line.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Claude error ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text: string = data?.content?.[0]?.text || '';
  if (!text.trim()) throw new Error('Claude returned empty script');
  return text.trim();
}

// HeyGen v2 — kick a video.generate using the avatar's heygen_custom_avatar_id
// and the script text. Returns the heygen video_id which we then poll for.
//
// API docs: https://docs.heygen.com/reference/create-an-avatar-video-v2
async function kickHeygen(job: GenJob, scriptText: string): Promise<string> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY missing');

  // Load the avatar's heygen_custom_avatar_id and voice_clone_id (or fallback voice)
  let heygenAvatarId: string | null = null;
  let voiceId: string | null = null;
  if (job.brand_profile_id) {
    const { data: avatar } = await supabaseAdmin
      .from('brand_profiles')
      .select('heygen_custom_avatar_id, voice_clone_id, voice_preset_id')
      .eq('id', job.brand_profile_id)
      .single();
    if (avatar) {
      heygenAvatarId = (avatar.heygen_custom_avatar_id as string | null) || null;
      voiceId = (avatar.voice_clone_id as string | null) || (avatar.voice_preset_id as string | null) || null;
    }
  }

  if (!heygenAvatarId) {
    throw new Error('Avatar has no heygen_custom_avatar_id — finish avatar setup before rendering');
  }
  // Fallback to a generic HeyGen voice if no per-avatar voice is set.
  const useVoice = voiceId || '1bd001e7e50f421d891986aad5158bc8';

  const body = {
    video_inputs: [
      {
        character: { type: 'avatar', avatar_id: heygenAvatarId, avatar_style: 'normal' },
        voice: { type: 'text', input_text: scriptText.slice(0, 1500), voice_id: useVoice },
        background: { type: 'color', value: '#ffffff' },
      },
    ],
    dimension: { width: 720, height: 1280 },  // vertical
    aspect_ratio: '9:16',
    test: false,
  };

  const resp = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': key,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`HeyGen generate ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const videoId: string | undefined = data?.data?.video_id;
  if (!videoId) throw new Error('HeyGen did not return video_id: ' + JSON.stringify(data).slice(0, 200));
  return videoId;
}

async function pollHeygen(videoId: string): Promise<{ done: boolean; url?: string; failed?: boolean; error?: string }> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY missing');

  const resp = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
    headers: { 'X-Api-Key': key },
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return { done: false, failed: true, error: `HeyGen status ${resp.status}: ${errText.slice(0, 200)}` };
  }
  const data = await resp.json();
  const status: string = data?.data?.status || 'unknown';
  const url: string | undefined = data?.data?.video_url;
  if (status === 'completed' && url) return { done: true, url };
  if (status === 'failed') return { done: false, failed: true, error: data?.data?.error?.message || 'HeyGen render failed' };
  return { done: false }; // still processing
}