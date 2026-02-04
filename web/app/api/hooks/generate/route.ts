import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

  const { concept_id, count = 20, style_preset, category_risk } = body as Record<string, unknown>;

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

  // Determine AI provider
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return NextResponse.json(
      { ok: false, error: "No AI API key configured" },
      { status: 500 }
    );
  }

  try {
    let generatedHooks: Array<{ hook_text: string; hook_style: string; angle: string }> = [];

    const hookCount = typeof count === "number" ? Math.min(Math.max(count, 1), 50) : 20;
    
    const prompt = `Generate exactly ${hookCount} TikTok Shop viral hooks for this concept:

Title: ${concept.concept_title || concept.title}
Core Angle: ${concept.core_angle}
Category: ${category_risk || "general"}
Style: ${style_preset || "viral"}

Requirements:
- Each hook must be 5-12 words maximum
- Designed for A/B testing (only hook changes)
- TikTok Shop oriented for product promotion
- For supplements: NO medical claims, avoid "cure", "treat", "diagnose", "guaranteed"
- Focus on curiosity, social proof, transformation, urgency
- Vary hook styles: curiosity, social_proof, transformation, urgency, educational, emotional

Return ONLY valid JSON in this exact format:
{
  "hooks": [
    { "hook_text": "This supplement hack went viral", "hook_style": "curiosity", "angle": "viral_trend" },
    { "hook_text": "Why everyone's buying this supplement", "hook_style": "social_proof", "angle": "popularity" }
  ]
}`;

    if (anthropicKey) {
      // Use Anthropic Claude
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const anthropicResult = await response.json();
      const content = anthropicResult.content?.[0]?.text;
      
      if (!content) {
        throw new Error("No content returned from Anthropic");
      }

      const parsed = JSON.parse(content);
      generatedHooks = parsed.hooks;

    } else if (openaiKey) {
      // Use OpenAI
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const openaiResult = await response.json();
      const content = openaiResult.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error("No content returned from OpenAI");
      }

      const parsed = JSON.parse(content);
      generatedHooks = parsed.hooks;
    }

    // Validate generated hooks
    if (!Array.isArray(generatedHooks) || generatedHooks.length === 0) {
      throw new Error("Invalid hooks format returned from AI");
    }

    // Insert hooks into database
    const hooksToInsert = generatedHooks.map(hook => ({
      hook_text: hook.hook_text,
      hook_style: hook.hook_style,
      concept_id: concept_id.trim(),
    }));

    const { data: insertedHooks, error: insertError } = await supabaseAdmin
      .from("hooks")
      .insert(hooksToInsert)
      .select();

    if (insertError) {
      console.error("Hook insertion error:", insertError);
      return NextResponse.json(
        { ok: false, error: "Failed to save generated hooks" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: insertedHooks,
      meta: {
        count: insertedHooks?.length || 0,
        concept_id: concept_id.trim(),
        ai_provider: anthropicKey ? "anthropic" : "openai",
      },
    });

  } catch (error) {
    console.error("Hook generation error:", error);
    return NextResponse.json(
      { ok: false, error: `Hook generation failed: ${String(error)}` },
      { status: 500 }
    );
  }
}

/*
PowerShell Test Plan:

# 1. Get existing concept_id from concepts table
$conceptResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/concepts" -Method GET
$conceptId = $conceptResponse.data[0].id

# 2. Create hook manually via POST /api/hooks
$hookBody = "{`"concept_id`": `"$conceptId`", `"hook_text`": `"Try this viral supplement hack`", `"hook_style`": `"curiosity`", `"angle`": `"educational`"}"
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
