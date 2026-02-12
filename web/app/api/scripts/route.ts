import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { validateScriptJson, renderScriptText } from "@/lib/script-renderer";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { isWithinLimit, migrateOldPlanId } from '@/lib/plans';

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { searchParams } = new URL(request.url);
  const conceptId = searchParams.get("concept_id");
  const productId = searchParams.get("product_id");
  const status = searchParams.get("status");
  const templateId = searchParams.get("template_id");

  let query = supabaseAdmin
    .from("scripts")
    .select("*")
    .order("created_at", { ascending: false });

  // Filter by ownership: admins see all, others see only their own
  if (!authContext.isAdmin) {
    query = query.eq("created_by", authContext.user.id);
  }

  if (conceptId) {
    query = query.eq("concept_id", conceptId);
  }

  if (productId) {
    query = query.eq("product_id", productId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (templateId) {
    query = query.eq("template_id", templateId);
  }

  const { data, error } = await query;

  if (error) {
    const err = apiError("DB_ERROR", error.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check - user must be logged in
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // H4: Enforce plan script limits (same logic as scripts/generate)
  if (!authContext.isAdmin) {
    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', authContext.user.id)
      .single();

    const planId = migrateOldPlanId(sub?.plan_id || 'free');

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await supabaseAdmin
      .from('scripts')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', authContext.user.id)
      .gte('created_at', monthStart.toISOString());

    const usage = count ?? 0;

    if (!isWithinLimit(planId, 'scriptsPerMonth', usage)) {
      const err = apiError("PLAN_LIMIT", "Monthly script limit reached. Upgrade your plan for more scripts.", 403);
      return NextResponse.json({ ...err.body, upgrade: true, correlation_id: correlationId }, { status: err.status });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const {
    concept_id,
    template_id,
    product_id,
    title,
    script_json,
    on_screen_text,
    caption,
    hashtags,
    cta,
    spoken_script,
    status: scriptStatus,
    created_by,
  } = body as Record<string, unknown>;

  // Build insert payload
  const insertPayload: Record<string, unknown> = {
    version: 1,
    status: typeof scriptStatus === "string" ? scriptStatus : "DRAFT",
    created_by: authContext.user.id,  // Track script ownership
  };

  // concept_id is optional now (can create scripts without concept)
  if (typeof concept_id === "string" && concept_id.trim()) {
    insertPayload.concept_id = concept_id.trim();
  }

  // title is required for new script system
  if (typeof title === "string" && title.trim()) {
    insertPayload.title = title.trim();
  }

  // template_id reference
  if (typeof template_id === "string" && template_id.trim()) {
    insertPayload.template_id = template_id.trim();
  }

  // product_id reference
  if (typeof product_id === "string" && product_id.trim()) {
    insertPayload.product_id = product_id.trim();
  }

  // Handle script_json - validate and render to script_text
  if (script_json !== undefined && script_json !== null) {
    const validation = validateScriptJson(script_json);
    if (!validation.valid) {
      const err = apiError("INVALID_SCRIPT_JSON", `Invalid script_json: ${validation.errors.join(", ")}`, 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    insertPayload.script_json = script_json;
    const renderedText = renderScriptText(script_json as Parameters<typeof renderScriptText>[0]);
    insertPayload.script_text = renderedText;

    // Backwards compatibility: populate spoken_script from script_json.body if not provided
    const scriptJsonTyped = script_json as { body?: string; hook?: string };
    if (spoken_script === undefined && scriptJsonTyped.body) {
      insertPayload.spoken_script = scriptJsonTyped.body;
    }
  }

  // Legacy fields for backwards compatibility
  if (on_screen_text !== undefined) insertPayload.on_screen_text = on_screen_text;
  if (caption !== undefined) insertPayload.caption = caption;
  if (hashtags !== undefined) insertPayload.hashtags = hashtags;
  if (cta !== undefined) insertPayload.cta = cta;
  if (spoken_script !== undefined) insertPayload.spoken_script = spoken_script;
  if (typeof created_by === "string" && created_by.trim()) {
    insertPayload.created_by = created_by.trim();
  }

  const { data, error } = await supabaseAdmin
    .from("scripts")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("POST /api/scripts Supabase error:", error);
    console.error("POST /api/scripts insert payload:", insertPayload);
    const err = apiError("DB_ERROR", error.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
