import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/va/videos?va_name=<name>
 * VA endpoint — returns videos assigned to a specific VA.
 * Looks up the VA by display_name in team_members, then queries videos.
 * Requires VA_ACCESS_TOKEN for authentication.
 */
export async function GET(request: Request) {
  const correlationId = generateCorrelationId();

  // H7: Verify VA access token to prevent unauthorized access
  const vaToken = process.env.VA_ACCESS_TOKEN;
  const authHeader = request.headers.get("x-va-token") || new URL(request.url).searchParams.get("token");
  if (vaToken && authHeader !== vaToken) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized — invalid VA access token", correlation_id: correlationId },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const vaName = searchParams.get("va_name");

  if (!vaName || vaName.trim().length < 1) {
    return NextResponse.json(
      { ok: false, error: "va_name parameter is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  try {
    // Step 1: Look up team member(s) by display_name (case-insensitive)
    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id, display_name, role")
      .ilike("display_name", vaName.trim());

    // Collect all possible IDs to match against
    const matchIds: string[] = [];

    if (members && members.length > 0) {
      for (const m of members) {
        matchIds.push(m.user_id);
      }
    }

    // Step 2: Also check auth users by email prefix or full_name
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 50 });
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        const fullName = u.user_metadata?.full_name || u.user_metadata?.name || "";
        const email = u.email || "";
        if (
          fullName.toLowerCase().includes(vaName.trim().toLowerCase()) ||
          email.toLowerCase().startsWith(vaName.trim().toLowerCase())
        ) {
          matchIds.push(u.id);
        }
      }
    }

    if (matchIds.length === 0) {
      // No matching VA found — return empty but OK
      return NextResponse.json({
        ok: true,
        data: [],
        count: 0,
        message: "No team member found with that name",
        correlation_id: correlationId,
      });
    }

    // Step 3: Filter to valid UUIDs only — assigned_to is a UUID column,
    // and team_members may contain placeholder IDs like 'editor1'
    const uuidIds = [...new Set(matchIds.filter(id => UUID_REGEX.test(id)))];

    if (uuidIds.length === 0) {
      // Matched a team member but their user_id isn't a real UUID
      return NextResponse.json({
        ok: true,
        data: [],
        count: 0,
        message: "Team member found but has no linked auth account",
        correlation_id: correlationId,
      });
    }

    // Step 4: Query videos assigned to any matching UUID
    const { data, error } = await supabaseAdmin
      .from("videos")
      .select(`
        id, video_code, status, recording_status,
        product_id, product:product_id(id, name, brand),
        script_locked_text, script_locked_version,
        google_drive_url, final_video_url, posted_url, posted_platform,
        recording_notes, editor_notes, uploader_notes, edit_notes,
        assigned_to, assigned_at, assigned_role, assignment_state,
        assigned_expires_at,
        last_status_changed_at, created_at
      `)
      .in("assigned_to", uuidIds)
      .not("recording_status", "eq", "POSTED")
      .not("recording_status", "eq", "REJECTED")
      .order("last_status_changed_at", { ascending: true });

    if (error) {
      console.error(`[${correlationId}] VA videos query error:`, error.message, error.details);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch videos", correlation_id: correlationId },
        { status: 500 }
      );
    }

    const videos = flattenVideos(data || []);

    return NextResponse.json({
      ok: true,
      data: videos,
      count: videos.length,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] VA videos error:`, err);
    return NextResponse.json(
      { ok: false, error: "Internal server error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

function flattenVideos(data: Record<string, unknown>[]) {
  return data.map((v) => {
    const product = v.product as Record<string, unknown> | null;
    return {
      ...v,
      product_name: product?.name || null,
      product_brand: product?.brand || null,
      product: undefined,
    };
  });
}
