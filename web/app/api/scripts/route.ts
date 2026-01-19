import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conceptId = searchParams.get("concept_id");
  const hookId = searchParams.get("hook_id");

  let query = supabaseAdmin
    .from("scripts")
    .select("*")
    .order("created_at", { ascending: false });

  if (conceptId) {
    query = query.eq("concept_id", conceptId);
  }

  // Note: hook_id column doesn't exist in scripts table based on schema inspection
  // Only filter by concept_id for now

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

  const { concept_id, on_screen_text, caption, hashtags, cta } = body as Record<string, unknown>;

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
  if (on_screen_text !== undefined) insertPayload.on_screen_text = on_screen_text;
  if (caption !== undefined) insertPayload.caption = caption;
  if (hashtags !== undefined) insertPayload.hashtags = hashtags;
  if (cta !== undefined) insertPayload.cta = cta;

  const { data, error } = await supabaseAdmin
    .from("scripts")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("POST /api/scripts Supabase error:", error);
    console.error("POST /api/scripts insert payload:", insertPayload);

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

# 2. Create script manually via POST /api/scripts
$scriptBody = "{`"concept_id`": `"$conceptId`", `"on_screen_text`": [`"Hook text here`", `"Product benefits`"], `"caption`": `"Try this viral supplement hack! #supplements #health`", `"hashtags`": [`"#supplements`", `"#health`", `"#viral`"], `"cta`": `"Link in bio to get yours!`"}"
$scriptResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/scripts" -Method POST -ContentType "application/json" -Body $scriptBody
$scriptResponse

# 3. Generate script via POST /api/scripts/generate
$generateBody = "{`"concept_id`": `"$conceptId`", `"hook_text`": `"Try this viral supplement hack`", `"style_preset`": `"educational`", `"category_risk`": `"supplements`"}"
$generateResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/scripts/generate" -Method POST -ContentType "application/json" -Body $generateBody
$generateResponse

# 4. Fetch scripts via GET /api/scripts?concept_id=...
$getScriptsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/scripts?concept_id=$conceptId" -Method GET
$getScriptsResponse
*/
