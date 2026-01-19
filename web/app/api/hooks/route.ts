import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conceptId = searchParams.get("concept_id");

  let query = supabaseAdmin
    .from("hooks")
    .select("*")
    .order("created_at", { ascending: false });

  if (conceptId) {
    query = query.eq("concept_id", conceptId);
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

  const { hook_text, concept_id, hook_style } = body as Record<string, unknown>;

  if (typeof hook_text !== "string" || hook_text.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "hook_text is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (typeof concept_id !== "string" || concept_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "concept_id is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  const insertPayload: Record<string, unknown> = {
    hook_text: hook_text.trim(),
    concept_id: concept_id.trim(),
  };
  if (hook_style !== undefined) insertPayload.hook_style = hook_style;

  const { data, error } = await supabaseAdmin
    .from("hooks")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("POST /api/hooks Supabase error:", error);
    console.error("POST /api/hooks insert payload:", insertPayload);

    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

/*
PowerShell Test Plan:

# 1. Get existing concept_id from concepts table (for generate endpoint)
$conceptResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/concepts" -Method GET
$conceptId = $conceptResponse.data[0].id

# 2. Create hook manually via POST /api/hooks
$hookBody = "{`"hook_text`": `"Try this viral supplement hack`", `"hook_style`": `"curiosity`", `"concept_id`": `"$conceptId`"}"
$hookResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/hooks" -Method POST -ContentType "application/json" -Body $hookBody
$hookResponse

# 3. Generate 10 hooks via POST /api/hooks/generate
$generateBody = "{`"concept_id`": `"$conceptId`", `"count`": 10, `"style_preset`": `"viral`", `"category_risk`": `"supplements`"}"
$generateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/hooks/generate" -Method POST -ContentType "application/json" -Body $generateBody
$generateResponse

# 4. Fetch hooks via GET /api/hooks?concept_id=...
$getHooksResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/hooks?concept_id=$conceptId" -Method GET
$getHooksResponse
*/
