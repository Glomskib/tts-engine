import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { isWithinLimit, migrateOldPlanId } from '@/lib/plans';
import { enforceRateLimits } from '@/lib/rate-limit';
import { generateCorrelationId } from '@/lib/api-errors';

export const runtime = "nodejs";
export const maxDuration = 300;

interface GeneratedScriptContent {
  spoken_hook?: string;
  body?: string[];
  on_screen_text?: string[];
  caption?: string;
  hashtags?: string[];
  cta?: string;
  editor_notes?: string[];
  script_v1?: string;
}

// Safe JSON parser with repair logic
function safeParseJSON(content: string): { success: boolean; data: any; strategy: string } {
  // First attempt: direct parse
  try {
    const parsed = JSON.parse(content);
    return { success: true, data: parsed, strategy: "direct" };
  } catch {
    // Direct JSON parse failed, trying repair
  }

  // Second attempt: repair pass
  try {
    // Extract JSON object substring
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    
    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      throw new Error("No valid JSON object boundaries found");
    }
    
    let jsonSubstring = content.substring(firstBrace, lastBrace + 1);
    
    // Repair control characters inside quoted strings
    jsonSubstring = jsonSubstring.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, content) => {
      // Replace raw newlines with \n
      content = content.replace(/\n/g, "\\n");
      // Replace raw tabs with \t
      content = content.replace(/\t/g, "\\t");
      // Remove other ASCII control chars 0x00-0x1F except \n and \t
      content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      return `"${content}"`;
    });
    
    const parsed = JSON.parse(jsonSubstring);
    return { success: true, data: parsed, strategy: "repair" };
  } catch {
    // Repair JSON parse also failed
  }

  // Fallback: create minimal object
  const fallbackData = {
    script_v1: content.trim(),
    on_screen_text: ["Generated content"],
    caption: content.trim().slice(0, 180),
    hashtags: ["#content", "#generated"],
    cta: "Check it out!"
  };
  
  return { success: true, data: fallbackData, strategy: "fallback" };
}

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

  const { concept_id, hook_id, hook_text, style_preset, category_risk, change_focus, variant_number } = body as Record<string, unknown>;

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
    // ── Variety engine — randomize hook style, CTA, tone, and length ──
    const HOOK_STYLES = [
      'question',     // "Did you know...?" / "Why does nobody talk about...?"
      'statement',    // Bold claim: "This changed everything."
      'command',      // "Stop scrolling." / "Listen."
      'statistic',    // "87% of people don't know this..."
      'story_opener', // "So this happened to me last week..."
      'controversy',  // "This product is overhyped. Or is it?"
      'confession',   // "I was wrong about this..."
      'challenge',    // "I tried this for 30 days. Here's what happened."
      'urgency',      // "This is selling out. Here's why."
      'comparison',   // "I tested the $10 vs the $50 version..."
    ];

    const CTA_STYLES = [
      'Tap the yellow basket to grab yours',
      'Comment LINK and I\'ll send it to you',
      'I linked it below — go check it out',
      'The link is right there in the shop tab',
      'Don\'t wait on this one — yellow basket, go',
      'Grab it before it sells out again',
      'Follow me and tap the link to get yours',
      'Add it to your cart right now, you\'ll thank me later',
    ];

    const TONE_OPTIONS = ['high_energy', 'calm_confident', 'conversational', 'storytelling', 'educational'];
    const LENGTH_OPTIONS = ['15_sec', '30_sec', '60_sec'];

    // Randomly pick variety parameters for this generation
    const hookStyle = HOOK_STYLES[Math.floor(Math.random() * HOOK_STYLES.length)];
    const ctaStyle = CTA_STYLES[Math.floor(Math.random() * CTA_STYLES.length)];
    const toneChoice = TONE_OPTIONS[Math.floor(Math.random() * TONE_OPTIONS.length)];
    const lengthChoice = LENGTH_OPTIONS[Math.floor(Math.random() * LENGTH_OPTIONS.length)];

    let prompt = `=== SCRIPT GENERATION TASK ===
Generate a TikTok Shop script for this concept.

=== PRODUCT / CONCEPT ===
Title: ${concept.concept_title || concept.title}
Core Angle: ${concept.core_angle}
Hook: ${finalHookText}
Category: ${category_risk || "general"}

=== CREATIVE PARAMETERS ===
Hook Style: ${hookStyle} (use this approach for the opening line)
Tone: ${toneChoice}
Target Length: ${lengthChoice}
CTA Approach: "${ctaStyle}"
Style Preset: ${style_preset || "engaging"}

=== VOICE RULES ===
- Sound like a real person, not a commercial
- Never start with "I" — lead with the product, a hook question, or a command
- Vary sentence length — mix short punchy lines with longer descriptive ones
- Include natural filler words occasionally ("like", "honestly", "look")
- The script should feel like someone talking to their phone, not reading a teleprompter

=== COMPLIANCE RULES ===
- For supplements: NO medical claims, avoid "cure", "treat", "diagnose", "guaranteed"
- Use conservative, compliant language
- Focus on lifestyle benefits, not medical outcomes
- Include clear call-to-action for TikTok Shop

=== OUTPUT REQUIREMENTS ===
CRITICAL: Return ONLY valid minified JSON. No markdown. No code fences. Do not include literal newlines in JSON strings — use \\n instead. Make script_v1 a SINGLE LINE string with explicit \\n characters for line breaks.`;

    // Add controlled change instructions for A/B testing
    if (change_focus && variant_number) {
      const variantInstructions: Record<string, string> = {
        "cta": "VARIANT FOCUS: Generate a DIFFERENT call-to-action than typical 'Shop now'. Keep script_v1, on_screen_text, caption, hashtags identical to standard format, but create a unique, compelling CTA.",
        "caption": "VARIANT FOCUS: Generate a DIFFERENT caption style/tone. Keep script_v1, on_screen_text, hashtags, cta identical to standard format, but create a unique caption approach.",
        "on_screen_text": "VARIANT FOCUS: Generate DIFFERENT on-screen text overlays. Keep script_v1, caption, hashtags, cta identical to standard format, but create unique text overlay variations."
      };

      const instruction = variantInstructions[change_focus as string];
      if (instruction) {
        prompt += `\n\n${instruction} This is variant #${variant_number}.`;
      }
    }

    prompt += `

{
  "script_v1": "Full voiceover script text here with \\n for line breaks...",
  "on_screen_text": ["Text overlay 1", "Text overlay 2", "Text overlay 3"],
  "caption": "Complete caption with emojis and description",
  "hashtags": ["#supplement", "#health", "#tiktokmademebuyit", "#fyp"],
  "cta": "${ctaStyle}",
  "editor_notes": ["Note about pacing", "Note about visuals"]
}`;

    let generatedScript: GeneratedScriptContent = {};

    if (anthropicKey) {
      // Use Anthropic Claude — 120s timeout (Vercel Pro allows 300s)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      let response: Response;
      try {
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 3000,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
          signal: controller.signal,
        });
      } catch (err: unknown) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Anthropic API timed out after 120 seconds");
        }
        throw err;
      }
      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
      }

      const anthropicResult = await response.json();
      const content = anthropicResult.content?.[0]?.text;
      
      if (!content) {
        throw new Error("No content returned from Anthropic");
      }

      const parseResult = safeParseJSON(content);
      if (!parseResult.success) {
        console.error("Failed to parse Anthropic response after all attempts");
        return NextResponse.json(
          { 
            ok: false, 
            error: "Failed to parse AI response", 
            parseStrategy: "failed"
          },
          { status: 500 }
        );
      }
      
      generatedScript = parseResult.data;

    } else if (openaiKey) {
      // Use OpenAI — 120s timeout (Vercel Pro allows 300s)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            max_tokens: 3000,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });
      } catch (err: unknown) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("OpenAI API timed out after 120 seconds");
        }
        throw err;
      }
      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`OpenAI API error: ${response.status} ${errorBody}`);
      }

      const openaiResult = await response.json();
      const content = openaiResult.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error("No content returned from OpenAI");
      }

      const parseResult = safeParseJSON(content);
      if (!parseResult.success) {
        console.error("Failed to parse OpenAI response after all attempts");
        return NextResponse.json(
          { 
            ok: false, 
            error: "Failed to parse AI response", 
            parseStrategy: "failed"
          },
          { status: 500 }
        );
      }
      
      generatedScript = parseResult.data;
    }

    // Validate generated script structure
    if (!generatedScript.on_screen_text || !generatedScript.caption || !generatedScript.hashtags || !generatedScript.cta) {
      throw new Error("Invalid script format returned from AI");
    }

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
      on_screen_text: Array.isArray(generatedScript.on_screen_text)
        ? generatedScript.on_screen_text.join(" | ")
        : String(generatedScript.on_screen_text || ""),
      caption: String(generatedScript.caption || "Generated caption"),
      hashtags: Array.isArray(generatedScript.hashtags)
        ? generatedScript.hashtags.join(" ")
        : String(generatedScript.hashtags || "#content"),
      cta: String(generatedScript.cta || "Check it out!"),
      version: nextVersion,
      spoken_script: String(generatedScript.script_v1 || "Generated script"), // Required NOT NULL column
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

    return NextResponse.json({
      ok: true,
      data: {
        ...insertedScript,
        // Include generated fields that aren't stored in DB
        script_v1: generatedScript.script_v1,
        editor_notes: generatedScript.editor_notes,
      },
      meta: {
        concept_id: concept_id.trim(),
        hook_text: finalHookText,
        ai_provider: anthropicKey ? "anthropic" : "openai",
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
