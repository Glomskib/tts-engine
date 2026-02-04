import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { type VideoStatus } from "@/lib/video-pipeline";
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = "nodejs";

// Initial status for videos created from variants
const INITIAL_STATUS: VideoStatus = "draft";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { variant_id, google_drive_url } = body as Record<string, unknown>;

  if (typeof variant_id !== "string" || variant_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "variant_id is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (typeof google_drive_url !== "string" || google_drive_url.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "google_drive_url is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  try {
    // Fetch variant with related data
    const { data: variant, error: variantError } = await supabaseAdmin
      .from("variants")
      .select("*")
      .eq("id", variant_id.trim())
      .single();

    if (variantError || !variant) {
      return NextResponse.json(
        { ok: false, error: "Variant not found" },
        { status: 404 }
      );
    }

    // Fetch related script if script_id exists
    let script = null;
    if (variant.script_id) {
      const { data: scriptData, error: scriptError } = await supabaseAdmin
        .from("scripts")
        .select("*")
        .eq("id", variant.script_id)
        .single();
      
      if (!scriptError && scriptData) {
        script = scriptData;
      }
    }

    // Build insert payload with required fields only
    const insertPayload: Record<string, unknown> = {
      variant_id: variant_id.trim(),
      google_drive_url: google_drive_url.trim(),
      status: INITIAL_STATUS,
    };

    // Do not attempt to insert columns that don't exist yet

    const { data, error } = await supabaseAdmin
      .from("videos")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("POST /api/videos/from-variant Supabase error:", error);
      console.error("POST /api/videos/from-variant insert payload:", insertPayload);

      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        // Include related data for context
        variant,
        script,
        prefilled_fields: {
          caption_used: script?.caption || null,
          hashtags_used: script?.hashtags || null
        }
      },
      meta: {
        variant_id: variant_id.trim(),
        script_id: variant.script_id || null,
        prefilled_from_script: !!script
      }
    });

  } catch (error) {
    console.error("Video from variant creation error:", error);
    return NextResponse.json(
      { ok: false, error: `Failed to create video from variant: ${String(error)}` },
      { status: 500 }
    );
  }
}

/*
PowerShell Test Plan:

# 1. Get existing variant_id from variants table
$variantResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants" -Method GET
$variantId = $variantResponse.data[0].id

# 2. Create video from variant via POST /api/videos/from-variant
$fromVariantBody = "{`"variant_id`": `"$variantId`"}"
$fromVariantResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos/from-variant" -Method POST -ContentType "application/json" -Body $fromVariantBody
$fromVariantResponse

# 3. Verify the created video has prefilled data
$createdVideoId = $fromVariantResponse.data.id
$verifyResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/videos?variant_id=$variantId" -Method GET
$verifyResponse
*/
