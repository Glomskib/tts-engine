import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conceptId = searchParams.get("concept_id");
  const status = searchParams.get("status");

  let query = supabaseAdmin
    .from("variants")
    .select("*")
    .order("created_at", { ascending: false });

  if (conceptId) {
    query = query.eq("concept_id", conceptId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { concept_id, hook_id, script_id, title, label, notes, status } = body as Record<string, unknown>;

  if (typeof concept_id !== "string" || concept_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "concept_id is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  // Build insert payload based on existing schema columns
  const insertPayload: Record<string, unknown> = {
    concept_id: concept_id.trim(),
  };

  // Add optional fields that exist in schema
  if (hook_id !== undefined) insertPayload.hook_id = hook_id;
  if (script_id !== undefined) insertPayload.script_id = script_id;
  if (status !== undefined) insertPayload.status = status;

  // Note: change_type, title, label, notes columns don't exist in variants table
  // Only using columns that actually exist: id, concept_id, hook_id, script_id, status, created_at, updated_at

  const { data, error } = await supabaseAdmin
    .from("variants")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("POST /api/variants Supabase error:", error);
    console.error("POST /api/variants insert payload:", insertPayload);

    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

/*
PowerShell Test Plan:

# 1. Get existing concept_id from concepts table
$conceptResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/concepts" -Method GET
$conceptId = $conceptResponse.data[0].id

# 2. Create variant manually via POST /api/variants
$variantBody = "{`"concept_id`": `"$conceptId`", `"hook_id`": `"test-hook-id`", `"script_id`": `"test-script-id`", `"status`": `"active`"}"
$variantResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method POST -ContentType "application/json" -Body $variantBody
$variantResponse

# 3. Generate 5 hook variants for a concept_id
$generateBody = "{`"concept_id`": `"$conceptId`", `"variant_plan`": {`"change_type`": `"hook`", `"count`": 5}, `"style_preset`": `"viral`", `"category_risk`": `"supplements`"}"
$generateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/generate" -Method POST -ContentType "application/json" -Body $generateBody
$generateResponse

# 4. Fetch variants via GET /api/variants?concept_id=...
$getVariantsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants?concept_id=$conceptId" -Method GET
$getVariantsResponse
*/
