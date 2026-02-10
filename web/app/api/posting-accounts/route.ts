import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/posting-accounts
 *
 * Fetch all active posting accounts for dropdown selection.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("include_inactive") === "true";

  try {
    let query = supabaseAdmin
      .from("posting_accounts")
      .select("id, display_name, account_code, platform, is_active")
      .order("display_name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[${correlationId}] Failed to fetch posting accounts:`, error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch posting accounts", correlation_id: correlationId },
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
    console.error(`[${correlationId}] Posting accounts error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

/**
 * POST /api/posting-accounts
 *
 * Create a new posting account (admin only).
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const { display_name, account_code, platform } = body as Record<string, unknown>;

  if (!display_name || typeof display_name !== "string" || display_name.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "display_name is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  if (!account_code || typeof account_code !== "string" || account_code.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "account_code is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  // Validate account_code format (uppercase alphanumeric, max 8 chars)
  const cleanCode = account_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (cleanCode.length < 2) {
    return NextResponse.json(
      { ok: false, error: "account_code must be at least 2 alphanumeric characters", correlation_id: correlationId },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("posting_accounts")
      .insert({
        display_name: display_name.trim(),
        account_code: cleanCode,
        platform: typeof platform === "string" ? platform.trim() : "tiktok",
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "Account code already exists", correlation_id: correlationId },
          { status: 409 }
        );
      }
      console.error(`[${correlationId}] Failed to create posting account:`, error);
      return NextResponse.json(
        { ok: false, error: "Failed to create posting account", correlation_id: correlationId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Create posting account error:`, error);
    return NextResponse.json(
      { ok: false, error: "Internal error", correlation_id: correlationId },
      { status: 500 }
    );
  }
}
