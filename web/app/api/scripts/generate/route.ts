import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { isWithinLimit, migrateOldPlanId } from '@/lib/plans';
import { enforceRateLimits } from '@/lib/rate-limit';
import { generateCorrelationId } from '@/lib/api-errors';
import { generateUnifiedScript } from '@/lib/unified-script-generator';
import { spendCredits } from '@/lib/credits';

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  // Rate limit: 10 script generations per minute per user
  const correlationId = generateCorrelationId();
  const rateLimited = enforceRateLimits({ userId: auth.user.id }, correlationId, { userLimit: 10 });
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  // ── Plan limit check ──
  // Admin users bypass limits; for everyone else, count scripts generated this
  // calendar month and compare against their plan's scriptsPerMonth limit.
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim());
  const isAdmin = adminUsers.includes(auth.user.email || '') || adminUsers.includes(auth.user.id);

  if (!isAdmin) {
    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', auth.user.id)
      .single();

    const planId = migrateOldPlanId(sub?.plan_id || 'free');

    // Count scripts generated this calendar month for the user
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Get user's concept IDs, then count scripts in those concepts this month
    const { data: userConcepts } = await supabaseAdmin
      .from('concepts')
      .select('id')
      .eq('user_id', auth.user.id);

    const conceptIds = (userConcepts || []).map(c => c.id);
    let usage = 0;
    if (conceptIds.length > 0) {
      const { count } = await supabaseAdmin
        .from('scripts')
        .select('id', { count: 'exact', head: true })
        .in('concept_id', conceptIds)
        .gte('created_at', monthStart.toISOString());
      usage = count ?? 0;
    }

    if (!isWithinLimit(planId, 'scriptsPerMonth', usage)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Monthly script limit reached. Upgrade your plan for more scripts.',
          upgrade: true,
          currentUsage: usage,
          planId,
        },
        { status: 403 }
      );
    }
  }

  const { concept_id, hook_id, hook_text, category_risk } = body as Record<string, unknown>;

  if (typeof concept_id !== "string" || concept_id.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "concept_id is required and must be a non-empty string" },
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

  // Determine hook text to use
  let finalHookText = "";
  
  if (typeof hook_id === "string" && hook_id.trim() !== "") {
    // Try to fetch hook by ID (if hooks table has concept_id after migration)
    const { data: hook, error: hookError } = await supabaseAdmin
      .from("hooks")
      .select("*")
      .eq("id", hook_id.trim())
      .single();
    
    if (hook && !hookError) {
      finalHookText = hook.hook_text;
    } else if (typeof hook_text === "string" && hook_text.trim() !== "") {
      finalHookText = hook_text.trim();
    } else {
      return NextResponse.json(
        { ok: false, error: "Hook not found and no hook_text provided" },
        { status: 400 }
      );
    }
  } else if (typeof hook_text === "string" && hook_text.trim() !== "") {
    finalHookText = hook_text.trim();
  } else {
    return NextResponse.json(
      { ok: false, error: "Either hook_id or hook_text is required" },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    // ── Generate script via unified generator ──
    const result = await generateUnifiedScript({
      productName: concept.concept_title || concept.title,
      productNotes: concept.core_angle,
      hookText: finalHookText,
      categoryRisk: (category_risk as string) || 'general',
      userId: auth.user.id,
      callerContext: 'scripts_generate',
    });

    // Get next version number for this concept
    const { data: maxVersionRow } = await supabaseAdmin
      .from("scripts")
      .select("version")
      .eq("concept_id", concept_id.trim())
      .order("version", { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (maxVersionRow?.version ?? 0) + 1;

    // Insert script into database using existing schema columns
    const insertPayload: Record<string, unknown> = {
      concept_id: concept_id.trim(),
      on_screen_text: result.onScreenText.join(" | "),
      caption: result.caption || "Generated caption",
      hashtags: result.hashtags.join(" "),
      cta: result.cta || "Check it out!",
      version: nextVersion,
      spoken_script: result.spokenScript || "Generated script",
    };

    const { data: insertedScript, error: insertError } = await supabaseAdmin
      .from("scripts")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error("Script insertion error:", insertError);
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to save generated script",
          details: insertError.message,
          payload: insertPayload
        },
        { status: 500 }
      );
    }

    // ── Deduct credits (3 per script, admins bypass) ──
    const SCRIPT_CREDIT_COST = 3;
    let creditsRemaining: number | undefined;
    if (!isAdmin) {
      const spend = await spendCredits(
        auth.user.id,
        SCRIPT_CREDIT_COST,
        "generation",
        "Script generation",
        false,
      );
      creditsRemaining = spend.remaining;
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...insertedScript,
        script_v1: result.spokenScript,
        editor_notes: result.editorNotes,
      },
      meta: {
        concept_id: concept_id.trim(),
        hook_text: finalHookText,
        ai_provider: "anthropic_sonnet",
        persona: result.persona,
        sales_approach: result.salesApproach,
        creditsRemaining,
      },
    });

  } catch (error) {
    console.error("Script generation error:", error);
    return NextResponse.json(
      { ok: false, error: `Script generation failed: ${String(error)}` },
      { status: 500 }
    );
  }
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
