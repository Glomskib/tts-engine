import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { NextResponse } from "next/server";
import { callAnthropicAPI, callAnthropicJSON } from "@/lib/ai/anthropic";
import { trackUsage } from "@/lib/command-center/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

interface SkitBeat {
  t: string;
  action: string;
  dialogue?: string;
  on_screen_text?: string;
}

interface SkitData {
  hook_line: string;
  beats: SkitBeat[];
  b_roll: string[];
  overlays: string[];
  cta_line: string;
  cta_overlay: string;
}

interface ChatContext {
  brand?: string;
  product?: string;
  current_script?: string;
  current_skit?: SkitData;
  spoken_hook?: string;
  visual_hook?: string;
  angle?: string;
}

interface ChatRequest {
  message: string;
  context?: ChatContext;
  video_id?: string;
  mode?: "chat" | "rewrite";
}

/**
 * POST /api/ai/chat
 *
 * Simple AI chat for iterative script/hook tweaks.
 * Provides quick responses for adjusting copy.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Rate limiting check
  const authContext = await getApiAuthContext(request);
  const rateLimitContext = {
    userId: authContext.user?.id ?? null,
    orgId: null, // Org membership is event-sourced; user-level limiting is sufficient
    ...extractRateLimitContext(request),
  };
  const rateLimitResponse = enforceRateLimits(rateLimitContext, correlationId);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const { message, context, video_id, mode } = body as ChatRequest;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Message is required", 400, correlationId);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return createApiErrorResponse("AI_ERROR", "AI service unavailable", 503, correlationId);
  }

  const isRewrite = mode === "rewrite" && context?.current_skit;

  try {
    let systemPrompt: string;

    if (isRewrite) {
      // Rewrite mode: AI returns a modified skit as JSON
      systemPrompt = `You are a TikTok script rewriter. The user wants you to modify an existing script.
Apply the user's edit instruction to the current script and return the FULL rewritten script as JSON.

Current script JSON:
${JSON.stringify(context.current_skit, null, 2)}`;

      if (context.brand) systemPrompt += `\n\nBrand: ${context.brand}`;
      if (context.product) systemPrompt += `\nProduct: ${context.product}`;
      if (context.angle) systemPrompt += `\nAngle: ${context.angle}`;

      systemPrompt += `

CRITICAL: Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "hook_line": "Opening hook text",
  "beats": [{"t": "0:00-0:03", "action": "description", "dialogue": "spoken words", "on_screen_text": "overlay text"}],
  "b_roll": ["shot suggestion 1"],
  "overlays": ["text overlay 1"],
  "cta_line": "Call to action spoken text",
  "cta_overlay": "CTA overlay text"
}

Keep all existing beats/structure unless the user specifically asks to change them.
Apply the edit instruction precisely — if they say "make it longer", add more beats. If they say "punchier hook", rewrite only the hook.`;
    } else {
      // Chat mode: text advice
      systemPrompt = `You are a creative copywriting assistant for TikTok video scripts.
You help make scripts punchier, hooks more engaging, and CTAs more compelling.
Keep responses SHORT and actionable - give specific suggestions, not lengthy explanations.
When asked for alternatives, provide 2-3 options formatted as a numbered list.
Maintain a casual, UGC-friendly tone in all suggestions.`;

      if (context) {
        systemPrompt += `\n\nCurrent video context:`;
        if (context.brand) systemPrompt += `\n- Brand: ${context.brand}`;
        if (context.product) systemPrompt += `\n- Product: ${context.product}`;
        if (context.spoken_hook) systemPrompt += `\n- Current hook: "${context.spoken_hook}"`;
        if (context.visual_hook) systemPrompt += `\n- Visual direction: ${context.visual_hook}`;
        if (context.angle) systemPrompt += `\n- Angle: ${context.angle}`;
        if (context.current_script) {
          systemPrompt += `\n- Current script:\n"""\n${context.current_script.slice(0, 500)}\n"""`;
        }
      }
    }

    let response: string = "";
    let rewrittenSkit: SkitData | null = null;

    if (anthropicKey) {
      if (isRewrite) {
        // Use JSON extraction for rewrite mode
        try {
          const { parsed, raw } = await callAnthropicJSON<SkitData>(message.trim(), {
            model: "claude-haiku-4-5-20251001",
            maxTokens: 2000,
            temperature: 0.7,
            systemPrompt,
            correlationId,
            requestType: "chat-rewrite",
            agentId: "ai-chat",
          });
          rewrittenSkit = parsed;
          response = `Script updated — ${raw.usage.output_tokens} tokens used.`;
        } catch {
          // Fallback: if JSON parse fails, return as text advice
          const fallback = await callAnthropicAPI(message.trim(), {
            model: "claude-haiku-4-5-20251001",
            maxTokens: 2000,
            temperature: 0.7,
            systemPrompt,
            correlationId,
            requestType: "chat-rewrite",
            agentId: "ai-chat",
          });
          response = fallback.text || "Sorry, I couldn't rewrite the script. Try rephrasing your request.";
        }
      } else {
        const result = await callAnthropicAPI(message.trim(), {
          model: "claude-haiku-4-5-20251001",
          maxTokens: 500,
          temperature: 0.7,
          systemPrompt,
          correlationId,
          requestType: "chat",
          agentId: "ai-chat",
        });
        response = result.text || "Sorry, I couldn't generate a response.";
      }
    } else if (openaiKey) {
      const start = Date.now();
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message.trim() },
          ],
          max_tokens: isRewrite ? 2000 : 500,
          temperature: 0.7,
        }),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errorText = await res.text();
        trackUsage({
          provider: "openai",
          model: "gpt-3.5-turbo",
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: latencyMs,
          status: "error",
          error_code: `HTTP_${res.status}`,
          request_type: isRewrite ? "chat-rewrite" : "chat",
          agent_id: "ai-chat",
          correlation_id: correlationId,
        }).catch(() => {});
        throw new Error(`OpenAI API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      const content = result.choices?.[0]?.message?.content || "";

      if (isRewrite && content) {
        // Try to parse JSON from OpenAI response
        try {
          const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          const jsonStr = fenceMatch ? fenceMatch[1].trim() : content;
          const objectMatch = jsonStr.match(/[\[{][\s\S]*[\]}]/);
          rewrittenSkit = JSON.parse(objectMatch ? objectMatch[0] : jsonStr);
          response = "Script updated.";
        } catch {
          response = content;
        }
      } else {
        response = content || "Sorry, I couldn't generate a response.";
      }

      trackUsage({
        provider: "openai",
        model: "gpt-3.5-turbo",
        input_tokens: result.usage?.prompt_tokens ?? 0,
        output_tokens: result.usage?.completion_tokens ?? 0,
        latency_ms: latencyMs,
        request_type: isRewrite ? "chat-rewrite" : "chat",
        agent_id: "ai-chat",
        correlation_id: correlationId,
      }).catch((e) => console.error("[ai-chat] openai usage tracking failed:", e));
    }

    const responseBody: Record<string, unknown> = {
      ok: true,
      response,
      video_id,
      correlation_id: correlationId,
    };
    if (rewrittenSkit) {
      responseBody.rewritten_skit = rewrittenSkit;
      responseBody.mode = "rewrite";
    }

    const successResponse = NextResponse.json(responseBody);
    successResponse.headers.set("x-correlation-id", correlationId);
    return successResponse;

  } catch (error) {
    console.error(`[${correlationId}] AI chat error:`, error);
    return createApiErrorResponse(
      "AI_ERROR",
      `AI error: ${error instanceof Error ? error.message : String(error)}`,
      500,
      correlationId
    );
  }
}
