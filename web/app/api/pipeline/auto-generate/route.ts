/**
 * Pipeline Orchestrator: Auto-Generate
 *
 * POST /api/pipeline/auto-generate
 * Master endpoint that chains the full content pipeline:
 *
 *   Step 1: Generate UGC script (via unified script generator)
 *   Step 2: Score script (lib/script-scorer.ts) — retry up to 3x if < 7
 *           Feeds scorer feedback into regeneration prompts
 *   Step 3: Generate HeyGen avatar video (async — cron finishes)
 *   Step 4: [TODO] Generate B-roll via Runway
 *   Step 5: Shotstack compose (handled by check-renders cron)
 *   Step 6: Quality gate (handled by check-renders cron)
 *
 * Auth: Admin session or CRON_SECRET Bearer token.
 * Each step logs to video_events. Telegram notification at each stage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { sendTelegramNotification } from '@/lib/telegram';
import {
  scoreScript,
  type ScriptScoreResult,
} from '@/lib/script-scorer';
import { textToSpeech } from '@/lib/elevenlabs';
import { uploadAudio, generateVideo, getPersonaByName } from '@/lib/heygen';
import { BRAND_PERSONA_MAP } from '@/lib/product-persona-map';
import { lintScriptAndCaption, type PolicyPack } from '@/lib/compliance-linter';
import {
  generateUnifiedScript,
  type UnifiedScriptOutput,
} from '@/lib/unified-script-generator';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Avatar and voice assignment is handled by getPersonaByName() from lib/heygen-personas.ts
// which maps persona names → avatar IDs + gender-matched voice IDs.

// --- Input Schema ---
const AutoGenerateSchema = z.object({
  productId: z.string().uuid(),
  personaId: z.string().uuid().nullable().optional(),
  renderProvider: z.enum(['heygen', 'runway']).default('heygen'),
});

// --- Step Logger ---
async function logStep(params: {
  videoId: string;
  step: number;
  stepName: string;
  status: 'started' | 'completed' | 'failed';
  correlationId: string;
  details?: Record<string, unknown>;
}) {
  const { videoId, step, stepName, status, correlationId, details } = params;
  const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳';

  // Log to video_events
  try {
    await supabaseAdmin.from('video_events').insert({
      video_id: videoId,
      event_type: `pipeline_step_${step}_${status}`,
      correlation_id: correlationId,
      actor: 'pipeline_orchestrator',
      details: { step, step_name: stepName, status, ...details },
    });
  } catch (err) {
    console.error(`[${correlationId}] Failed to log step ${step}:`, err);
  }

  // Telegram notification for completions/failures only (not starts)
  if (status !== 'started') {
    const label = details?.productLabel || videoId.slice(0, 8);
    sendTelegramNotification(
      `${emoji} Pipeline Step ${step}/6: <b>${stepName}</b> — ${status}\n📦 ${label}`
    ).catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  // --- Auth: Admin session or CRON_SECRET ---
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  let isAuthorized = false;
  let actorId = 'cron';

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  } else {
    const authContext = await getApiAuthContext(request);
    if (authContext.user && authContext.isAdmin) {
      isAuthorized = true;
      actorId = authContext.user.id;
    }
  }

  if (!isAuthorized) {
    return createApiErrorResponse(
      'UNAUTHORIZED',
      'Admin or cron access required',
      401,
      correlationId
    );
  }

  // --- Parse Input ---
  let input: z.infer<typeof AutoGenerateSchema>;
  try {
    const body = await request.json();
    input = AutoGenerateSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        err.issues.map((i) => `${i.path}: ${i.message}`).join('; '),
        400,
        correlationId
      );
    }
    return createApiErrorResponse(
      'BAD_REQUEST',
      'Invalid JSON',
      400,
      correlationId
    );
  }

  // --- Fetch Product ---
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, name, brand, category, product_image_url')
    .eq('id', input.productId)
    .single();

  if (productError || !product) {
    return createApiErrorResponse(
      'NOT_FOUND',
      'Product not found',
      404,
      correlationId
    );
  }

  const productLabel = product.brand
    ? `${product.brand} — ${product.name}`
    : product.name;

  // --- Resolve Persona ---
  let personaName: string | null = null;
  let audiencePersonaId: string | undefined;

  if (input.personaId) {
    audiencePersonaId = input.personaId;
    const { data: persona } = await supabaseAdmin
      .from('audience_personas')
      .select('name')
      .eq('id', input.personaId)
      .single();
    personaName = persona?.name || null;
  } else if (product.brand) {
    // Auto-map brand → persona via BRAND_PERSONA_MAP
    personaName = BRAND_PERSONA_MAP[product.brand] || null;
    if (personaName) {
      const { data: persona } = await supabaseAdmin
        .from('audience_personas')
        .select('id')
        .eq('name', personaName)
        .limit(1)
        .single();
      audiencePersonaId = persona?.id;
    }
  }

  // --- Create Video Record ---
  // Use NOT_RECORDED status so no cron picks it up during script generation
  const videoCode = `AUTO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const { data: video, error: videoError } = await supabaseAdmin
    .from('videos')
    .insert({
      video_code: videoCode,
      product_id: product.id,
      recording_status: 'NOT_RECORDED',
      render_provider: input.renderProvider,
      google_drive_url: '',
    })
    .select('id, video_code, recording_status')
    .single();

  if (videoError || !video) {
    console.error(`[${correlationId}] Video creation error:`, videoError);
    return createApiErrorResponse(
      'DB_ERROR',
      `Failed to create video record: ${videoError?.message || 'unknown'}`,
      500,
      correlationId
    );
  }

  // Pipeline started notification
  sendTelegramNotification(
    `🚀 Pipeline started: <b>${productLabel}</b>\n📋 Video: ${video.video_code}\n🎭 Persona: ${personaName || 'default'}`
  ).catch(() => {});

  try {
    // ================================================================
    // STEP 1 + 2: Generate Script with Scoring Loop
    // ================================================================
    await logStep({
      videoId: video.id,
      step: 1,
      stepName: 'Script Generation',
      status: 'started',
      correlationId,
    });

    let bestScript: UnifiedScriptOutput | null = null;
    let bestScore: ScriptScoreResult | null = null;
    const MAX_SCRIPT_ATTEMPTS = 3;
    let previousScore: ScriptScoreResult | undefined;

    for (let attempt = 1; attempt <= MAX_SCRIPT_ATTEMPTS; attempt++) {
      // Generate script via unified generator (feeds scorer feedback on retries)
      try {
        bestScript = await generateUnifiedScript({
          productId: product.id,
          userId: actorId !== 'cron' ? actorId : undefined,
          audiencePersonaId,
          targetLength: '15_sec',
          previousScore: previousScore,
          callerContext: 'pipeline',
        });
      } catch (genErr) {
        console.error(
          `[${correlationId}] Script gen attempt ${attempt} failed:`,
          genErr
        );

        if (attempt === MAX_SCRIPT_ATTEMPTS) {
          await logStep({
            videoId: video.id,
            step: 1,
            stepName: 'Script Generation',
            status: 'failed',
            correlationId,
            details: { productLabel, attempts: attempt },
          });
          await supabaseAdmin
            .from('videos')
            .update({
              recording_status: 'REJECTED',
              recording_notes:
                'Pipeline: script generation failed after 3 attempts',
            })
            .eq('id', video.id);
          return createApiErrorResponse(
            'AI_ERROR',
            'Script generation failed after 3 attempts',
            500,
            correlationId
          );
        }
        continue;
      }

      await logStep({
        videoId: video.id,
        step: 1,
        stepName: 'Script Generation',
        status: 'completed',
        correlationId,
        details: { productLabel, attempt, persona: bestScript.persona },
      });

      // ── Score the generated script ──
      await logStep({
        videoId: video.id,
        step: 2,
        stepName: 'Script Scoring',
        status: 'started',
        correlationId,
      });

      try {
        bestScore = await scoreScript({
          script: bestScript.spokenScript,
          persona: personaName || bestScript.persona || 'general UGC creator',
          product: productLabel,
          hook: bestScript.hook,
        });
      } catch (scoreErr) {
        console.error(
          `[${correlationId}] Scoring failed on attempt ${attempt}:`,
          scoreErr
        );
        bestScore = null;
        await logStep({
          videoId: video.id,
          step: 2,
          stepName: 'Script Scoring',
          status: 'completed',
          correlationId,
          details: {
            productLabel,
            score: null,
            note: 'Scoring service unavailable — proceeding with script',
          },
        });
        break;
      }

      if (bestScore && bestScore.passed) {
        await logStep({
          videoId: video.id,
          step: 2,
          stepName: 'Script Scoring',
          status: 'completed',
          correlationId,
          details: {
            productLabel,
            score: bestScore.totalScore,
            passed: true,
            attempt,
            scores: bestScore.scores,
          },
        });
        break;
      }

      // Below threshold — feed feedback into next attempt
      if (attempt < MAX_SCRIPT_ATTEMPTS) {
        console.log(
          `[${correlationId}] Script scored ${bestScore?.totalScore}/10 (attempt ${attempt}/${MAX_SCRIPT_ATTEMPTS}), regenerating with feedback...`
        );
        previousScore = bestScore ?? undefined;
      } else {
        await logStep({
          videoId: video.id,
          step: 2,
          stepName: 'Script Scoring',
          status: 'completed',
          correlationId,
          details: {
            productLabel,
            score: bestScore?.totalScore,
            passed: false,
            note: 'Max retries reached — proceeding with best script',
            feedback: bestScore?.feedback,
          },
        });
      }
    }

    if (!bestScript) {
      await supabaseAdmin
        .from('videos')
        .update({
          recording_status: 'REJECTED',
          recording_notes: 'Pipeline: no script generated',
        })
        .eq('id', video.id);
      return createApiErrorResponse(
        'AI_ERROR',
        'Failed to generate any script',
        500,
        correlationId
      );
    }

    // ================================================================
    // STEP 2.5: Compliance Check (before spending render credits)
    // ================================================================
    const lintScript = bestScript.spokenScript;
    const overlayTexts = bestScript.onScreenText;

    // Use supplements policy for supplement/health products, generic for everything else
    const categoryLower = (product.category || '').toLowerCase();
    const policyPack: PolicyPack =
      categoryLower.includes('supplement') || categoryLower.includes('health')
        ? 'supplements'
        : 'generic';

    const complianceResult = lintScriptAndCaption({
      script_text: lintScript,
      caption: overlayTexts.join(' '),
      policy_pack: policyPack,
    });

    if (complianceResult.severity === 'block') {
      const blockedTerms = complianceResult.issues
        .filter((i) => i.severity === 'block')
        .map((i) => `${i.matched_term} (${i.code})`)
        .join(', ');

      await logStep({
        videoId: video.id,
        step: 2,
        stepName: 'Compliance Check',
        status: 'failed',
        correlationId,
        details: {
          productLabel,
          policy_pack: policyPack,
          blocked_terms: blockedTerms,
          issues: complianceResult.issues,
        },
      });

      await supabaseAdmin
        .from('videos')
        .update({
          recording_status: 'REJECTED',
          recording_notes: `Pipeline: compliance blocked — ${blockedTerms}`,
        })
        .eq('id', video.id);

      return createApiErrorResponse(
        'COMPLIANCE_BLOCKED',
        `Script contains blocked terms: ${blockedTerms}`,
        400,
        correlationId
      );
    }

    if (complianceResult.severity === 'warn') {
      const warnings = complianceResult.issues
        .map((i) => `${i.matched_term} (${i.code})`)
        .join(', ');

      // Log warning but continue — these aren't blocking
      await supabaseAdmin.from('video_events').insert({
        video_id: video.id,
        event_type: 'compliance_warning',
        correlation_id: correlationId,
        actor: 'pipeline_orchestrator',
        details: {
          policy_pack: policyPack,
          warnings,
          issues: complianceResult.issues,
        },
      });
    }

    // ================================================================
    // STEP 3: Save Skit + TTS + HeyGen Avatar Render
    // ================================================================
    await logStep({
      videoId: video.id,
      step: 3,
      stepName: 'Avatar Render (HeyGen)',
      status: 'started',
      correlationId,
    });

    // Save script to saved_skits (linked to video) — store as skit-compatible shape
    const skitData = {
      hook_line: bestScript.hook,
      beats: [
        { dialogue: bestScript.setup, on_screen_text: bestScript.onScreenText[0] || '' },
        { dialogue: bestScript.body, on_screen_text: bestScript.onScreenText[1] || '' },
      ],
      cta_line: bestScript.cta,
      cta_overlay: bestScript.onScreenText[bestScript.onScreenText.length - 1] || '',
    };

    const { error: skitError } = await supabaseAdmin
      .from('saved_skits')
      .insert({
        video_id: video.id,
        product_id: product.id,
        title: `Auto Pipeline — ${product.name}`,
        skit_data: skitData,
        generation_config: {
          content_type: 'ugc_short',
          source: 'auto_pipeline_unified',
          persona: bestScript.persona,
          sales_approach: bestScript.salesApproach,
          script_score: bestScore?.totalScore || null,
        },
        status: 'approved',
      });

    if (skitError) {
      console.error(`[${correlationId}] Skit save error:`, skitError);
      // Non-fatal — continue anyway
    }

    // Lock script text on the video record
    const fullScript = bestScript.spokenScript;

    await supabaseAdmin
      .from('videos')
      .update({
        script_locked_text: fullScript,
        script_locked_json: skitData,
      })
      .eq('id', video.id);

    // Resolve persona config (avatar + gender-matched voice) from heygen-personas.ts
    const personaConfig = getPersonaByName(personaName);
    const avatarId = personaConfig.avatarId;
    const voiceId = personaConfig.voiceId;

    // Generate TTS audio via ElevenLabs (voice matches avatar gender)
    let audioBuffer: ArrayBuffer;
    try {
      audioBuffer = await textToSpeech(fullScript, voiceId, {
        stability: personaConfig.voiceStability,
        similarityBoost: personaConfig.voiceSimilarityBoost,
      });
    } catch (ttsErr) {
      console.error(`[${correlationId}] TTS generation failed:`, ttsErr);
      await logStep({
        videoId: video.id,
        step: 3,
        stepName: 'Avatar Render (HeyGen)',
        status: 'failed',
        correlationId,
        details: {
          productLabel,
          error: 'TTS generation failed',
          message: ttsErr instanceof Error ? ttsErr.message : String(ttsErr),
        },
      });
      await supabaseAdmin
        .from('videos')
        .update({
          recording_status: 'REJECTED',
          recording_notes: 'Pipeline: TTS generation failed',
        })
        .eq('id', video.id);
      return createApiErrorResponse(
        'AI_ERROR',
        'TTS generation failed',
        500,
        correlationId
      );
    }

    // Upload audio to HeyGen
    let audioUrl: string;
    try {
      const uploadResult = await uploadAudio(audioBuffer);
      audioUrl = uploadResult.url;
    } catch (uploadErr) {
      console.error(
        `[${correlationId}] HeyGen audio upload failed:`,
        uploadErr
      );
      await logStep({
        videoId: video.id,
        step: 3,
        stepName: 'Avatar Render (HeyGen)',
        status: 'failed',
        correlationId,
        details: { productLabel, error: 'HeyGen audio upload failed' },
      });
      await supabaseAdmin
        .from('videos')
        .update({
          recording_status: 'REJECTED',
          recording_notes: 'Pipeline: HeyGen audio upload failed',
        })
        .eq('id', video.id);
      return createApiErrorResponse(
        'AI_ERROR',
        'HeyGen audio upload failed',
        500,
        correlationId
      );
    }

    // Submit HeyGen video generation (async — cron polls for completion)
    let heygenVideoId: string;
    try {
      const genResult = await generateVideo(audioUrl, avatarId);
      heygenVideoId = genResult.video_id;
    } catch (genErr) {
      console.error(
        `[${correlationId}] HeyGen video generation failed:`,
        genErr
      );
      await logStep({
        videoId: video.id,
        step: 3,
        stepName: 'Avatar Render (HeyGen)',
        status: 'failed',
        correlationId,
        details: { productLabel, error: 'HeyGen generation request failed' },
      });
      await supabaseAdmin
        .from('videos')
        .update({
          recording_status: 'REJECTED',
          recording_notes: 'Pipeline: HeyGen generation request failed',
        })
        .eq('id', video.id);
      return createApiErrorResponse(
        'AI_ERROR',
        'HeyGen video generation failed',
        500,
        correlationId
      );
    }

    // Transition video to AI_RENDERING — the check-renders cron takes over
    await supabaseAdmin
      .from('videos')
      .update({
        recording_status: 'AI_RENDERING',
        render_provider: 'heygen',
        render_task_id: heygenVideoId,
        render_prompt: fullScript.slice(0, 500),
        last_status_changed_at: new Date().toISOString(),
      })
      .eq('id', video.id);

    // Log video event for the status transition
    await supabaseAdmin.from('video_events').insert({
      video_id: video.id,
      event_type: 'render_submitted',
      correlation_id: correlationId,
      actor: actorId,
      from_status: 'NOT_RECORDED',
      to_status: 'AI_RENDERING',
      details: {
        render_provider: 'heygen',
        heygen_video_id: heygenVideoId,
        avatar_id: avatarId,
        voice_id: voiceId,
        script_score: bestScore?.totalScore || null,
      },
    });

    await logStep({
      videoId: video.id,
      step: 3,
      stepName: 'Avatar Render (HeyGen)',
      status: 'completed',
      correlationId,
      details: {
        productLabel,
        avatarId,
        heygenVideoId,
        note: 'Async render started — check-renders cron handles completion',
      },
    });

    // ================================================================
    // STEPS 4-6: Handled by the check-renders cron
    // ================================================================
    // Step 4: B-roll via Runway (TODO — future enhancement)
    // Step 5: Shotstack compose (cron: HeyGen complete → re-host → compose)
    // Step 6: Quality gate (cron: compose complete → frame capture → score)

    // Final summary notification
    sendTelegramNotification(
      [
        `🎬 Pipeline handed off to renderer: <b>${productLabel}</b>`,
        `⏳ HeyGen rendering (ID: ${heygenVideoId.slice(0, 12)}...)`,
        `🤖 Avatar: ${avatarId}`,
        `📊 Script score: ${bestScore?.totalScore || 'N/A'}/10`,
        '',
        'Steps 5-6 handled by check-renders cron.',
      ].join('\n')
    ).catch(() => {});

    const response = NextResponse.json({
      ok: true,
      data: {
        video_id: video.id,
        video_code: video.video_code,
        product: productLabel,
        persona: bestScript?.persona || personaName,
        sales_approach: bestScript?.salesApproach || null,
        pipeline_status: 'rendering',
        steps: {
          1: {
            name: 'Script Generation (Unified)',
            status: 'completed',
          },
          2: {
            name: 'Script Scoring',
            status: 'completed',
            score: bestScore?.totalScore ?? null,
            passed: bestScore?.passed ?? null,
            feedback: bestScore?.feedback ?? null,
          },
          3: {
            name: 'HeyGen Avatar',
            status: 'rendering',
            heygen_video_id: heygenVideoId,
            avatar: avatarId,
          },
          4: {
            name: 'B-roll (Runway)',
            status: 'pending',
            note: 'Future enhancement',
          },
          5: {
            name: 'Shotstack Compose',
            status: 'pending',
            note: 'Handled by check-renders cron',
          },
          6: {
            name: 'Quality Gate',
            status: 'pending',
            note: 'Handled by check-renders cron',
          },
        },
        script_score: bestScore
          ? {
              total: bestScore.totalScore,
              passed: bestScore.passed,
              dimensions: bestScore.scores,
              feedback: bestScore.feedback,
              improvements: bestScore.suggestedImprovements,
            }
          : null,
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    console.error(`[${correlationId}] Pipeline error:`, err);

    // Mark video as failed
    await supabaseAdmin
      .from('videos')
      .update({
        recording_status: 'REJECTED',
        recording_notes: `Pipeline error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
      .eq('id', video.id);

    sendTelegramNotification(
      `🔴 Pipeline FAILED: <b>${productLabel}</b>\n❌ ${err instanceof Error ? err.message : 'Unknown error'}`
    ).catch(() => {});

    return createApiErrorResponse(
      'INTERNAL',
      err instanceof Error ? err.message : 'Pipeline failed',
      500,
      correlationId
    );
  }
}
