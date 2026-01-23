import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { validateScriptJson, renderScriptText, ScriptJson } from "@/lib/script-renderer";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Safe JSON parser with repair logic (same pattern as scripts/generate)
function safeParseJSON(content: string): { success: boolean; data: unknown; strategy: string } {
  // First attempt: direct parse
  try {
    const parsed = JSON.parse(content);
    return { success: true, data: parsed, strategy: "direct" };
  } catch (error) {
    console.log(`Direct JSON parse failed: ${error}`);
  }

  // Second attempt: repair pass
  try {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      throw new Error("No valid JSON object boundaries found");
    }

    let jsonSubstring = content.substring(firstBrace, lastBrace + 1);

    // Repair control characters inside quoted strings
    jsonSubstring = jsonSubstring.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, innerContent) => {
      innerContent = innerContent.replace(/\n/g, "\\n");
      innerContent = innerContent.replace(/\t/g, "\\t");
      innerContent = innerContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      return `"${innerContent}"`;
    });

    const parsed = JSON.parse(jsonSubstring);
    return { success: true, data: parsed, strategy: "repair" };
  } catch (error) {
    console.log(`Repair JSON parse failed: ${error}`);
  }

  return { success: false, data: null, strategy: "failed" };
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    const err = apiError("INVALID_UUID", "Invalid script ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const { product_context, rewrite_prompt, created_by } = body as Record<string, unknown>;

  if (typeof rewrite_prompt !== "string" || rewrite_prompt.trim() === "") {
    const err = apiError("BAD_REQUEST", "rewrite_prompt is required", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Fetch current script
  const { data: script, error: scriptError } = await supabaseAdmin
    .from("scripts")
    .select("*")
    .eq("id", id)
    .single();

  if (scriptError) {
    if (scriptError.code === "PGRST116") {
      const err = apiError("NOT_FOUND", "Script not found", 404);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }
    const err = apiError("DB_ERROR", scriptError.message, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check for AI API key
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    const err = apiError("AI_ERROR", "No AI API key configured", 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    // Build the AI prompt
    const currentScriptJson = script.script_json || {
      hook: script.spoken_script?.split("\n")[0] || "",
      body: script.spoken_script || "",
      cta: script.cta || "",
      bullets: [],
    };

    const productContextStr = product_context
      ? `\n\nProduct Context:\n${JSON.stringify(product_context, null, 2)}`
      : "";

    const prompt = `You are a professional TikTok script writer. Rewrite the following script based on the user's instructions.

Current Script (JSON format):
${JSON.stringify(currentScriptJson, null, 2)}
${productContextStr}

User's Rewrite Instructions:
${rewrite_prompt.trim()}

Requirements:
- For supplements/health products: NO medical claims, avoid "cure", "treat", "diagnose", "guaranteed"
- Use conservative, compliant language
- Focus on lifestyle benefits, not medical outcomes
- Keep the script engaging and suitable for TikTok

CRITICAL: Return ONLY valid minified JSON with this exact structure:
{
  "hook": "Opening hook text that grabs attention...",
  "body": "Main body content with the core message...",
  "cta": "Call to action text...",
  "bullets": ["Key point 1", "Key point 2", "Key point 3"],
  "on_screen_text": ["Text overlay 1", "Text overlay 2"],
  "b_roll": ["Shot suggestion 1", "Shot suggestion 2"],
  "pacing": "slow|medium|fast",
  "compliance_notes": "Any compliance considerations...",
  "uploader_instructions": "Posting guidance...",
  "product_tags": ["tag1", "tag2"]
}

All fields are optional except hook and body. No markdown. No code fences. No explanations. Just the JSON object.`;

    let generatedContent: string = "";
    let modelUsed: string = "";

    if (anthropicKey) {
      modelUsed = "claude-3-haiku-20240307";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelUsed,
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const result = await response.json();
      generatedContent = result.content?.[0]?.text || "";

      if (!generatedContent) {
        throw new Error("No content returned from Anthropic");
      }
    } else if (openaiKey) {
      modelUsed = "gpt-3.5-turbo";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: modelUsed,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 3000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const result = await response.json();
      generatedContent = result.choices?.[0]?.message?.content || "";

      if (!generatedContent) {
        throw new Error("No content returned from OpenAI");
      }
    }

    console.log(`AI response length: ${generatedContent.length}, preview: ${generatedContent.slice(0, 400)}`);

    // Parse the AI response
    const parseResult = safeParseJSON(generatedContent);
    if (!parseResult.success) {
      const err = apiError("AI_ERROR", "Failed to parse AI response as JSON", 500, {
        rawPreview: generatedContent.slice(0, 500),
      });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    console.log(`JSON parse strategy used: ${parseResult.strategy}`);

    // Validate the generated JSON matches our schema (strict mode rejects unknown keys)
    const validation = validateScriptJson(parseResult.data, { strict: true });
    if (!validation.valid) {
      const err = apiError("VALIDATION_ERROR", `AI output validation failed: ${validation.errors.join(", ")}`, 500, {
        rawPreview: generatedContent.slice(0, 500),
      });
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const rewriteResultJson = parseResult.data as ScriptJson;
    const rewriteResultText = renderScriptText(rewriteResultJson);

    // Store the rewrite record
    const { error: rewriteInsertError } = await supabaseAdmin.from("script_rewrites").insert({
      script_id: id,
      product_context_json: product_context || null,
      rewrite_prompt: rewrite_prompt.trim(),
      rewrite_result_json: rewriteResultJson,
      rewrite_result_text: rewriteResultText,
      model: modelUsed,
      created_by: typeof created_by === "string" ? created_by.trim() : null,
    });

    if (rewriteInsertError) {
      console.error("Failed to insert rewrite record:", rewriteInsertError);
      // Continue anyway - the main operation is updating the script
    }

    // Update the script with new content and increment version
    const { data: updatedScript, error: updateError } = await supabaseAdmin
      .from("scripts")
      .update({
        script_json: rewriteResultJson,
        script_text: rewriteResultText,
        version: (script.version || 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update script:", updateError);
      const err = apiError("DB_ERROR", updateError.message, 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: updatedScript,
      meta: {
        model: modelUsed,
        parse_strategy: parseResult.strategy,
        previous_version: script.version || 1,
        new_version: updatedScript.version,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error("Script rewrite error:", error);
    const err = apiError("AI_ERROR", `Script rewrite failed: ${String(error)}`, 500);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }
}
