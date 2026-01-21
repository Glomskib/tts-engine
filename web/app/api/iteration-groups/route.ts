import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const winner_variant_id = searchParams.get('winner_variant_id');

    let query = supabaseAdmin
      .from('iteration_groups')
      .select('id,winner_variant_id,concept_id,plan_json,status,error_message,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (winner_variant_id) {
      query = query.eq('winner_variant_id', winner_variant_id);
    }

    const { data: iterationGroups, error } = await query.limit(50);

    if (error) {
      console.error('Failed to fetch iteration groups:', error);
      return NextResponse.json(
        { 
          ok: false, 
          error: 'Failed to fetch iteration groups',
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
      data: iterationGroups || []
    });

  } catch (error) {
    console.error('GET /api/iteration-groups error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
