/**
 * GET /api/heygen-voices
 *
 * Returns the list of HeyGen stock voices for any signed-in user. Backed by
 * the in-memory cache in lib/heygen-voices.ts (1-hour TTL) so the upstream
 * HeyGen call only happens a few times per server lifetime.
 *
 * Auth-gated (any signed-in user) so we don't leak the voice catalog or burn
 * HeyGen quota for anonymous traffic.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { listHeygenVoices } from '@/lib/heygen-voices';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const correlationId = generateCorrelationId();

  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);
  }

  try {
    const voices = await listHeygenVoices();
    const resp = NextResponse.json({ ok: true, voices, correlation_id: correlationId });
    // Browser-side cache for an hour — matches the server cache TTL.
    resp.headers.set('Cache-Control', 'private, max-age=3600');
    resp.headers.set('x-correlation-id', correlationId);
    return resp;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return createApiErrorResponse('INTERNAL', `Could not load voices: ${msg}`, 502, correlationId);
  }
}
