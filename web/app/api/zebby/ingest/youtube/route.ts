/**
 * POST /api/zebby/ingest/youtube
 *
 * Convenience wrapper around /api/video-engine/runs/from-youtube that pins
 * workspace='zebby' so admin UIs and CLI calls don't have to know about the
 * underlying workspace→mode mapping.
 *
 * Body:
 *   { url: string, target_clip_count?: number, context?: object, source_episode_title?: string }
 *
 * Returns the same shape as /api/video-engine/runs/from-youtube:
 *   { ok, data: { run_id, storage_path, duration_sec, byte_size, source }, correlation_id }
 *
 * Everything else (auth, plan caps, Cobalt download, Supabase upload, run
 * creation, template resolution, scoring) flows through the existing video-
 * engine plumbing — we just set the mode and pass through.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in to ingest YouTube videos.', 401, correlationId);
  }

  let body: {
    url?: string;
    target_clip_count?: number;
    context?: Record<string, unknown>;
    source_episode_title?: string;
  };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId);
  }

  if (!body.url) {
    return createApiErrorResponse('BAD_REQUEST', 'A YouTube URL is required.', 400, correlationId);
  }

  // Forward to the existing from-youtube route with workspace pinned to 'zebby'.
  // Merge a few Zebby-specific context fields so the run shows up correctly in
  // any downstream views (mc-operator feed, posting queue, FinOps lane).
  const forwardBody = {
    url: body.url,
    workspace: 'zebby' as const,
    target_clip_count: body.target_clip_count,
    context: {
      ...(body.context ?? {}),
      brand: "Zebby's World",
      lane: "Zebby's World",
      source_episode_title: body.source_episode_title,
    },
  };

  const internalUrl = new URL('/api/video-engine/runs/from-youtube', request.url);
  const upstream = await fetch(internalUrl.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
      ...(request.headers.get('authorization')
        ? { authorization: request.headers.get('authorization') as string }
        : {}),
    },
    body: JSON.stringify(forwardBody),
  });

  const upstreamJson = await upstream.json().catch(() => ({} as Record<string, unknown>));
  return NextResponse.json(upstreamJson, { status: upstream.status });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only.' } },
    { status: 405 },
  );
}
