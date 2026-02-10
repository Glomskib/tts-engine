import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/team-members
 *
 * Fetch all team members for display name mapping.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    const { data, error } = await supabaseAdmin
      .from("team_members")
      .select("id, user_id, display_name, role, is_active")
      .order("display_name", { ascending: true });

    if (error) {
      // Table might not exist yet
      if (error.code === "42P01") {
        return NextResponse.json({
          ok: true,
          data: [],
          correlation_id: correlationId,
        });
      }
      console.error(`[${correlationId}] Failed to fetch team members:`, error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch team members", correlation_id: correlationId },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      data: data || [],
      correlation_id: correlationId,
    });
    response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Team members error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
