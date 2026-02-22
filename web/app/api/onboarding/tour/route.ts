import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select('main_tour_seen, main_tour_completed_at')
      .eq('user_id', authContext.user.id)
      .single();

    return NextResponse.json({
      main_tour_seen: data?.main_tour_seen ?? false,
      main_tour_completed_at: data?.main_tour_completed_at ?? null,
    });
  } catch (error) {
    console.error('[Tour] GET error:', error);
    return createApiErrorResponse('INTERNAL', 'Failed to fetch tour state', 500, correlationId);
  }
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const body = await request.json();
    const { seen, completed } = body as { seen?: boolean; completed?: boolean; skipped?: boolean };

    const updates: Record<string, unknown> = {
      user_id: authContext.user.id,
      updated_at: new Date().toISOString(),
    };

    if (seen) {
      updates.main_tour_seen = true;
    }
    if (completed) {
      updates.main_tour_completed_at = new Date().toISOString();
    }

    await supabaseAdmin
      .from('user_profiles')
      .upsert(updates, { onConflict: 'user_id' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Tour] POST error:', error);
    return createApiErrorResponse('INTERNAL', 'Failed to update tour state', 500, correlationId);
  }
}
