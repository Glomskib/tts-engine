import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { buildStyleProfile } from '@/lib/style-profile/build-style-profile';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const profile = await buildStyleProfile(authContext.user.id);

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      profile: {
        scripts_analyzed: profile.scripts_analyzed,
        built_at: profile.built_at,
        voice: profile.voice,
        hooks: profile.hooks,
        structure: profile.structure,
        cta: profile.cta,
        vocabulary: profile.vocabulary,
        content_patterns: profile.content_patterns,
      },
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build style profile';

    if (message.includes('at least 3 approved scripts')) {
      return createApiErrorResponse('BAD_REQUEST', message, 400, correlationId);
    }

    console.error('[style-profile/rebuild] Error:', message);
    return createApiErrorResponse('AI_ERROR', message, 500, correlationId);
  }
}
