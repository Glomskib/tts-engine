import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Type for created variants with associated data
interface CreatedVariant extends Record<string, unknown> {
  hook?: Record<string, unknown>;
  script?: Record<string, unknown>;
}

/**
 * Get the base URL for internal API calls.
 * Uses NEXT_PUBLIC_APP_URL if set, otherwise derives from request headers.
 */
function getBaseUrl(request: NextRequest): string {
  // Prefer explicit app URL for production
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Derive from request headers (works in Vercel and localhost)
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}

export async function POST(request: NextRequest) {
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

  const { concept_id, base_hook_id, variant_plan, category_risk, style_preset } = body as Record<string, unknown>;

  if (typeof concept_id !== "string" || concept_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "concept_id is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  if (!variant_plan || typeof variant_plan !== "object") {
    return NextResponse.json(
      { ok: false, error: "variant_plan is required and must be an object" },
      { status: 400 }
    );
  }

  const plan = variant_plan as Record<string, unknown>;
  const changeType = plan.change_type as string;
  const count = typeof plan.count === "number" ? Math.min(Math.max(plan.count, 1), 10) : 3;

  if (!["hook", "on_screen_text", "cta", "caption"].includes(changeType)) {
    return NextResponse.json(
      { ok: false, error: "variant_plan.change_type must be one of: hook, on_screen_text, cta, caption" },
      { status: 400 }
    );
  }

  // Fetch concept from database
  const { data: concept, error: conceptError } = await supabaseAdmin
    .from("concepts")
    .select("*")
    .eq("id", concept_id.trim())
    .single();

  if (conceptError || !concept) {
    return NextResponse.json(
      { ok: false, error: "Concept not found" },
      { status: 404 }
    );
  }

  try {
    const createdVariants: CreatedVariant[] = [];
    const baseUrl = getBaseUrl(request);

    if (changeType === "hook") {
      // Generate new hooks, then scripts for each hook, then create variants

      // Step 1: Generate new hooks
      const hooksResponse = await fetch(`${baseUrl}/api/hooks/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept_id: concept_id.trim(),
          count,
          style_preset: style_preset || "viral",
          category_risk: category_risk || "general"
        })
      });

      if (!hooksResponse.ok) {
        throw new Error("Failed to generate hooks");
      }

      const hooksResult = await hooksResponse.json();
      const generatedHooks = hooksResult.data;

      // Step 2: Generate scripts for each hook
      for (const hook of generatedHooks) {
        const scriptResponse = await fetch(`${baseUrl}/api/scripts/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            concept_id: concept_id.trim(),
            hook_text: hook.hook_text,
            style_preset: style_preset || "engaging",
            category_risk: category_risk || "general"
          })
        });

        if (!scriptResponse.ok) {
          console.error(`Failed to generate script for hook ${hook.id}`);
          continue;
        }

        const scriptResult = await scriptResponse.json();
        const generatedScript = scriptResult.data;

        // Step 3: Create variant linking concept + hook + script
        const { data: variant, error: variantError } = await supabaseAdmin
          .from("variants")
          .insert({
            concept_id: concept_id.trim(),
            hook_id: hook.id,
            script_id: generatedScript.id,
            status: "active"
          })
          .select()
          .single();

        if (!variantError && variant) {
          createdVariants.push({
            ...variant,
            hook: hook,
            script: generatedScript
          });
        }
      }

    } else {
      // For CTA/caption/on_screen_text changes: keep hook constant, modify script outputs
      
      let baseHook = null;
      if (typeof base_hook_id === "string" && base_hook_id.trim() !== "") {
        const { data: hook } = await supabaseAdmin
          .from("hooks")
          .select("*")
          .eq("id", base_hook_id.trim())
          .single();
        baseHook = hook;
      }

      if (!baseHook) {
        // Get any hook for this concept as base
        const { data: hooks } = await supabaseAdmin
          .from("hooks")
          .select("*")
          .eq("concept_id", concept_id.trim())
          .limit(1);
        baseHook = hooks?.[0];
      }

      if (!baseHook) {
        return NextResponse.json(
          { ok: false, error: "No base hook found. Generate hooks first or provide base_hook_id." },
          { status: 400 }
        );
      }

      // Generate multiple scripts with controlled changes
      for (let i = 0; i < count; i++) {
        const scriptResponse = await fetch(`${baseUrl}/api/scripts/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            concept_id: concept_id.trim(),
            hook_text: baseHook.hook_text,
            style_preset: style_preset || "engaging",
            category_risk: category_risk || "general",
            // Add instruction for controlled changes
            change_focus: changeType,
            variant_number: i + 1
          })
        });

        if (!scriptResponse.ok) {
          console.error(`Failed to generate variant script ${i + 1}`);
          continue;
        }

        const scriptResult = await scriptResponse.json();
        const generatedScript = scriptResult.data;

        // Create variant linking concept + base hook + new script
        const { data: variant, error: variantError } = await supabaseAdmin
          .from("variants")
          .insert({
            concept_id: concept_id.trim(),
            hook_id: baseHook.id,
            script_id: generatedScript.id,
            status: "active"
          })
          .select()
          .single();

        if (!variantError && variant) {
          createdVariants.push({
            ...variant,
            hook: baseHook,
            script: generatedScript
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: createdVariants,
      meta: {
        concept_id: concept_id.trim(),
        change_type: changeType,
        count: createdVariants.length,
        requested_count: count
      }
    });

  } catch (error) {
    console.error("Variant generation error:", error);
    return NextResponse.json(
      { ok: false, error: `Variant generation failed: ${String(error)}` },
      { status: 500 }
    );
  }
}

/*
PowerShell Test Plan:

# 1. Get existing concept_id from concepts table
$conceptResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/concepts" -Method GET
$conceptId = $conceptResponse.data[0].id

# 2. Generate 5 hook variants for a concept_id
$generateHooksBody = "{`"concept_id`": `"$conceptId`", `"variant_plan`": {`"change_type`": `"hook`", `"count`": 5}, `"style_preset`": `"viral`", `"category_risk`": `"supplements`"}"
$hooksVariantsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/generate" -Method POST -ContentType "application/json" -Body $generateHooksBody
$hooksVariantsResponse

# 3. Generate 3 CTA variants keeping the same hook/script
$generateCtaBody = "{`"concept_id`": `"$conceptId`", `"variant_plan`": {`"change_type`": `"cta`", `"count`": 3}, `"style_preset`": `"urgent`", `"category_risk`": `"supplements`"}"
$ctaVariantsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants/generate" -Method POST -ContentType "application/json" -Body $generateCtaBody
$ctaVariantsResponse

# 4. Fetch variants by concept_id
$getVariantsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/variants?concept_id=$conceptId" -Method GET
$getVariantsResponse
*/
