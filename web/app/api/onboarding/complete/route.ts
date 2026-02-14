import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const userId = authContext.user.id;

    try {
      await supabaseAdmin
        .from('user_profiles')
        .upsert({
          user_id: userId,
          onboarding_complete: true,
          onboarding_dismissed: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (dbError) {
      console.error('[Onboarding] Could not update user_profiles:', dbError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    return createApiErrorResponse('INTERNAL', 'Failed to complete onboarding', 500, correlationId);
  }
}
