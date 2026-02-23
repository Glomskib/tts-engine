import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const { data: profile, error } = await supabaseAdmin
      .from('ff_style_profiles')
      .select('profile_data, prompt_context, scripts_analyzed, version, built_at, created_at, updated_at')
      .eq('user_id', authContext.user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (expected when profile doesn't exist)
      throw error;
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      profile: profile
        ? {
            scripts_analyzed: profile.scripts_analyzed,
            version: profile.version,
            built_at: profile.built_at,
            updated_at: profile.updated_at,
            voice: (profile.profile_data as Record<string, unknown>)?.voice ?? null,
            hooks: (profile.profile_data as Record<string, unknown>)?.hooks ?? null,
            structure: (profile.profile_data as Record<string, unknown>)?.structure ?? null,
            cta: (profile.profile_data as Record<string, unknown>)?.cta ?? null,
            vocabulary: (profile.profile_data as Record<string, unknown>)?.vocabulary ?? null,
            content_patterns: (profile.profile_data as Record<string, unknown>)?.content_patterns ?? null,
          }
        : null,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch style profile';
    console.error('[style-profile] Error:', message);
    return createApiErrorResponse('DB_ERROR', message, 500, correlationId);
  }
}
