import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const { searchParams } = new URL(request.url);
    const winner_variant_id = searchParams.get('winner_variant_id');

    // Iteration groups are tied to concepts - get user's concept IDs
    let conceptIds: string[] = [];
    if (!authContext.isAdmin) {
      const { data: userConcepts } = await supabaseAdmin
        .from("concepts")
        .select("id")
        .eq("user_id", authContext.user.id);

      if (userConcepts && userConcepts.length > 0) {
        conceptIds = userConcepts.map(c => c.id);
      } else {
        // User has no concepts, return empty
        return NextResponse.json({ ok: true, data: [], correlation_id: correlationId });
      }
    }

    let query = supabaseAdmin
      .from('iteration_groups')
      .select('id,winner_variant_id,concept_id,plan_json,status,error_message,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (winner_variant_id) {
      query = query.eq('winner_variant_id', winner_variant_id);
    }

    // Filter by user's concepts (admins see all)
    if (!authContext.isAdmin && conceptIds.length > 0) {
      query = query.in('concept_id', conceptIds);
    }

    const { data: iterationGroups, error } = await query.limit(50);

    if (error) {
      console.error('Failed to fetch iteration groups:', error);
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to fetch iteration groups',
          correlation_id: correlationId,
          supabase: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          }
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: iterationGroups || [],
      correlation_id: correlationId
    });

  } catch (error) {
    console.error('GET /api/iteration-groups error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error', correlation_id: correlationId },
      { status: 500 }
    );
  }
}
