import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';

export const runtime = 'nodejs';

const PipelineAddSchema = z.object({
  product_name: z.string().min(1),
  brand: z.string().optional(),
  content_type: z.string().optional(),
  hook_text: z.string().min(1),
  score: z.number().optional(),
  source: z.string().default('content_package'),
  package_id: z.string().optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/pipeline
 * Add a content package item directly to the pipeline.
 * Creates a saved_skits entry (approved) and a video entry.
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

  const parsed = PipelineAddSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid input', 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { product_name, brand, content_type, hook_text, score, source, package_id, scheduled_date } = parsed.data;

  try {
    // 1. Try to resolve product_id from product name
    let productId: string | null = null;
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id')
      .ilike('name', product_name)
      .limit(1)
      .maybeSingle();

    if (product) {
      productId = product.id;
    }

    // 2. Create saved_skits entry with approved status
    const skitData = {
      hook_line: hook_text,
      beats: [],
      cta_line: '',
      cta_overlay: '',
    };

    const skitInsert: Record<string, unknown> = {
      user_id: authContext.user.id,
      title: `${product_name} — ${content_type || 'UGC'}`,
      skit_data: skitData,
      generation_config: {
        content_type: content_type || 'ugc_short',
        source,
        package_id: package_id || null,
        score: score || null,
      },
      status: 'approved',
    };

    if (productId) {
      skitInsert.product_id = productId;
    }

    const { data: skit, error: skitError } = await supabaseAdmin
      .from('saved_skits')
      .insert(skitInsert)
      .select('id')
      .single();

    if (skitError) {
      console.error(`[${correlationId}] Skit creation error:`, skitError);
      return createApiErrorResponse('DB_ERROR', 'Failed to create script entry', 500, correlationId);
    }

    // 3. Create video entry
    const videoCode = `PKG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const videoInsert: Record<string, unknown> = {
      video_code: videoCode,
      client_user_id: authContext.user.id,
      recording_status: 'NEEDS_SCRIPT',
      status: 'needs_edit',
      google_drive_url: '',
      script_locked_text: `HOOK: ${hook_text}`,
      brief: {
        hook: hook_text,
        product_name,
        brand: brand || null,
        content_type: content_type || null,
        source,
        package_id: package_id || null,
        score: score || null,
      },
    };

    if (productId) {
      videoInsert.product_id = productId;
    }

    if (scheduled_date) {
      videoInsert.scheduled_date = scheduled_date;
    }

    const { data: video, error: videoError } = await supabaseAdmin
      .from('videos')
      .insert(videoInsert)
      .select('id, video_code, recording_status')
      .single();

    if (videoError) {
      console.error(`[${correlationId}] Video creation error:`, videoError);
      return createApiErrorResponse('DB_ERROR', 'Failed to create pipeline entry', 500, correlationId);
    }

    // 4. Link skit to video
    await supabaseAdmin
      .from('saved_skits')
      .update({ video_id: video.id })
      .eq('id', skit.id);

    // 5. Log events (fire-and-forget)
    supabaseAdmin.from('video_events').insert([
      {
        video_id: video.id,
        event_type: 'created_from_package',
        correlation_id: correlationId,
        actor: authContext.user.id,
        from_status: null,
        to_status: 'NEEDS_SCRIPT',
        details: {
          product_name,
          brand: brand || null,
          content_type: content_type || null,
          hook: hook_text,
          score: score || null,
          source,
          package_id: package_id || null,
          skit_id: skit.id,
        },
      },
      {
        video_id: video.id,
        event_type: 'pipeline_added',
        correlation_id: correlationId,
        actor: authContext.user.id,
        from_status: null,
        to_status: 'NEEDS_SCRIPT',
        details: {
          source,
          skit_id: skit.id,
          client_user_id: authContext.user.id,
        },
      },
    ]).then(
      () => {},
      (err: unknown) => { console.error('Failed to write video events:', err); }
    );

    const response = NextResponse.json({
      ok: true,
      data: {
        video_id: video.id,
        video_code: video.video_code,
        skit_id: skit.id,
        status: video.recording_status,
        product_name,
        hook: hook_text,
      },
      correlation_id: correlationId,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Pipeline add error:`, error);
    return createApiErrorResponse(
      'INTERNAL',
      error instanceof Error ? error.message : 'Failed to add to pipeline',
      500,
      correlationId
    );
  }
}
