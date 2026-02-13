import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { createVideoFromProduct } from '@/lib/createVideoFromProduct';
import { createImageToVideo, createTextToVideo } from '@/lib/runway';
import { buildRunwayPrompt } from '@/lib/runway-prompt-builder';
import { logVideoActivity } from '@/lib/videoActivity';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/skits/batch-render
 * Returns UGC_SHORT skits that haven't been sent to video yet (no video_id).
 * Auth: API key required.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Valid API key required', 401, correlationId);
  }

  const { data: skits, error } = await supabaseAdmin
    .from('saved_skits')
    .select('id, title, product_id, product_name, product_brand, status, video_id, created_at')
    .filter('generation_config->>content_type', 'eq', 'ugc_short')
    .is('video_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
  }

  // Also count how many are already rendering
  const { count: renderingCount } = await supabaseAdmin
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('recording_status', 'AI_RENDERING');

  const response = NextResponse.json({
    ok: true,
    data: {
      pending_skits: skits || [],
      total_pending: skits?.length || 0,
      currently_rendering: renderingCount || 0,
    },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}

/**
 * POST /api/skits/batch-render
 * For each UGC_SHORT skit without a video:
 *   1. Creates video record via createVideoFromProduct
 *   2. Re-hosts product image to Supabase if external
 *   3. Builds Runway prompt from skit beats
 *   4. Triggers Runway render (image-to-video or text-to-video)
 *   5. Stores render_task_id, sets recording_status = AI_RENDERING
 *
 * Auth: API key required.
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Valid API key required', 401, correlationId);
  }

  let body: { skit_ids?: string[]; limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — auto-pick mode
  }

  const batchLimit = Math.min(body.limit || 5, 5);

  // Find UGC_SHORT skits without a linked video
  let query = supabaseAdmin
    .from('saved_skits')
    .select('id, title, product_id, product_name, product_brand, skit_data, generation_config, user_id')
    .filter('generation_config->>content_type', 'eq', 'ugc_short')
    .is('video_id', null)
    .order('created_at', { ascending: true })
    .limit(batchLimit);

  if (body.skit_ids && body.skit_ids.length > 0) {
    query = query.in('id', body.skit_ids.slice(0, batchLimit));
  }

  const { data: skits, error: skitErr } = await query;

  if (skitErr) {
    return createApiErrorResponse('DB_ERROR', skitErr.message, 500, correlationId);
  }

  if (!skits || skits.length === 0) {
    const response = NextResponse.json({
      ok: true,
      data: { triggered: 0, failed: 0, results: [] },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  const results: Array<{
    skit_id: string;
    product_name: string;
    video_id?: string;
    render_task_id?: string;
    status: 'success' | 'failed';
    error?: string;
  }> = [];

  for (const skit of skits) {
    try {
      if (!skit.product_id) {
        results.push({
          skit_id: skit.id,
          product_name: skit.product_name || 'unknown',
          status: 'failed',
          error: 'Skit has no product_id',
        });
        continue;
      }

      const skitData = skit.skit_data as {
        hook_line: string;
        beats: Array<{ t: string; action: string; dialogue?: string; on_screen_text?: string }>;
        cta_line: string;
        cta_overlay: string;
        b_roll?: string[];
        overlays?: string[];
      };

      // Step 1: Build script text from skit data
      const scriptLines: string[] = [];
      scriptLines.push('[HOOK]', skitData.hook_line, '');
      for (let i = 0; i < skitData.beats.length; i++) {
        const beat = skitData.beats[i];
        scriptLines.push(`[SCENE ${i + 1}] ${beat.t}`);
        scriptLines.push(`Action: ${beat.action}`);
        if (beat.dialogue) scriptLines.push(`Dialogue: "${beat.dialogue}"`);
        if (beat.on_screen_text) scriptLines.push(`On-screen text: "${beat.on_screen_text}"`);
        scriptLines.push('');
      }
      scriptLines.push('[CTA]', skitData.cta_line);
      if (skitData.cta_overlay) scriptLines.push(`Overlay: "${skitData.cta_overlay}"`);

      // Step 2: Create video record
      const videoResult = await createVideoFromProduct(
        {
          product_id: skit.product_id,
          script_path: 'existing',
          script_draft: scriptLines.join('\n'),
          brief: { hook: skitData.hook_line, notes: `Batch render from skit: ${skit.title}` },
          priority: 'normal',
        },
        correlationId,
        'batch-render'
      );

      if (!videoResult.ok || !videoResult.data) {
        results.push({
          skit_id: skit.id,
          product_name: skit.product_name || 'unknown',
          status: 'failed',
          error: videoResult.error || 'Failed to create video record',
        });
        continue;
      }

      const videoId = videoResult.data.video.id as string;

      // Link skit to video
      await supabaseAdmin
        .from('saved_skits')
        .update({ video_id: videoId, status: 'produced' })
        .eq('id', skit.id);

      // Step 3: Fetch product image
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('product_image_url, name, brand, category, notes, pain_points, product_display_name')
        .eq('id', skit.product_id)
        .single();

      let productImageUrl = product?.product_image_url;
      const productName = product?.product_display_name || product?.name || skit.product_name || 'the product';

      // --- Preflight checks (fail BEFORE spending a Runway credit) ---
      const preflightIssues: string[] = [];

      if (!productImageUrl) {
        preflightIssues.push('No product_image_url — text-to-video cannot show actual product');
      } else {
        try {
          const headResp = await fetch(productImageUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          if (!headResp.ok) {
            preflightIssues.push(`Product image returned HTTP ${headResp.status}`);
          }
        } catch {
          preflightIssues.push('Product image URL unreachable');
        }
      }

      if (!product?.name) {
        preflightIssues.push('Product name is empty');
      }

      const sceneActions = skitData.beats.map((b) => b.action).filter(Boolean);
      const totalActionWords = sceneActions.join(' ').split(/\s+/).length;
      if (totalActionWords > 50) {
        preflightIssues.push(`Beat actions total ${totalActionWords} words — too long for Runway (max ~50)`);
      }

      for (let i = 0; i < skitData.beats.length; i++) {
        const beat = skitData.beats[i];
        if (beat.action && beat.action.split(/\s+/).length > 25) {
          preflightIssues.push(`Beat ${i + 1} action is ${beat.action.split(/\s+/).length} words (max 25)`);
        }
      }

      if (preflightIssues.length > 0) {
        console.warn(`[${correlationId}] Preflight FAILED for skit ${skit.id}: ${preflightIssues.join('; ')}`);
        results.push({
          skit_id: skit.id,
          product_name: productName,
          video_id: videoId,
          status: 'failed',
          error: `Preflight failed: ${preflightIssues.join('; ')}`,
        });
        continue;
      }

      // Step 4: Re-host external image to Supabase
      if (productImageUrl && !productImageUrl.includes('supabase.co')) {
        try {
          const imgResp = await fetch(productImageUrl);
          if (imgResp.ok) {
            const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
            const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
            const imgBuffer = await imgResp.arrayBuffer();
            const imgBlob = new Blob([imgBuffer], { type: contentType });
            const imgPath = `product-images/${skit.product_id}_${Date.now()}.${ext}`;

            const { error: uploadErr } = await supabaseAdmin.storage
              .from('renders')
              .upload(imgPath, imgBlob, { contentType, upsert: true });

            if (!uploadErr) {
              const { data: urlData } = supabaseAdmin.storage
                .from('renders')
                .getPublicUrl(imgPath);
              productImageUrl = urlData.publicUrl;
            }
          }
        } catch {
          // Non-blocking — fall back to original URL
        }
      }

      // Step 5: Build AI-powered Runway prompt
      const dialogueLines: string[] = [];
      const ostLines: string[] = [];
      if (skitData.hook_line) dialogueLines.push(skitData.hook_line);
      for (const beat of skitData.beats) {
        if (beat.dialogue) dialogueLines.push(beat.dialogue);
        if (beat.on_screen_text) ostLines.push(beat.on_screen_text);
      }
      if (skitData.cta_line) dialogueLines.push(skitData.cta_line);
      if (skitData.cta_overlay) ostLines.push(skitData.cta_overlay);

      const promptResult = await buildRunwayPrompt({
        productName,
        brand: product?.brand || skit.product_brand || 'Unknown',
        productImageUrl,
        productDescription: product?.notes || (product?.pain_points as string) || null,
        category: product?.category || null,
        scriptText: dialogueLines.join(' ') || null,
        onScreenText: ostLines.join(' | ') || null,
      });

      const runwayPrompt = promptResult.prompt;
      console.log(`[${correlationId}] Prompt (${runwayPrompt.length} chars, ai=${promptResult.aiGenerated}): ${runwayPrompt}`);

      // Step 6: Trigger Runway render
      let runwayResult: { id?: string };
      if (productImageUrl) {
        runwayResult = await createImageToVideo(productImageUrl, runwayPrompt, 'gen4.5', 10);
      } else {
        runwayResult = await createTextToVideo(runwayPrompt, 'gen4.5', 10);
      }

      const renderTaskId = runwayResult.id ? String(runwayResult.id) : null;

      if (renderTaskId) {
        // Step 7: Store render_task_id, prompt, and set AI_RENDERING
        await supabaseAdmin
          .from('videos')
          .update({
            render_task_id: renderTaskId,
            render_provider: 'runway',
            render_prompt: runwayPrompt,
            recording_status: 'AI_RENDERING',
          })
          .eq('id', videoId);

        await logVideoActivity(
          supabaseAdmin,
          videoId,
          'recording_status_changed',
          'NOT_RECORDED',
          'AI_RENDERING',
          'system',
          `Batch render triggered (task: ${renderTaskId})`
        );

        results.push({
          skit_id: skit.id,
          product_name: productName,
          video_id: videoId,
          render_task_id: renderTaskId,
          status: 'success',
        });
      } else {
        results.push({
          skit_id: skit.id,
          product_name: productName,
          video_id: videoId,
          status: 'failed',
          error: 'Runway returned no task ID',
        });
      }
    } catch (err) {
      results.push({
        skit_id: skit.id,
        product_name: skit.product_name || 'unknown',
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const triggered = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  const response = NextResponse.json({
    ok: true,
    data: { triggered, failed, results },
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}
