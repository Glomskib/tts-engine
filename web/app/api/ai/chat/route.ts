import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { NextResponse } from "next/server";
import { callAnthropicAPI } from "@/lib/ai/anthropic";
import { trackUsage } from "@/lib/command-center/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatContext {
  brand?: string;
  product?: string;
  current_script?: string;
  spoken_hook?: string;
  visual_hook?: string;
  angle?: string;
}

interface ChatRequest {
  message: string;
  context?: ChatContext;
  video_id?: string;
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

  const { message, context, video_id } = body as ChatRequest;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return createApiErrorResponse("BAD_REQUEST", "Message is required", 400, correlationId);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return createApiErrorResponse("AI_ERROR", "AI service unavailable", 503, correlationId);
  }

  try {
    // Build context-aware system prompt
    let systemPrompt = `You are a creative copywriting assistant for TikTok video scripts.
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

    let response: string = "";

    if (anthropicKey) {
      const result = await callAnthropicAPI(message.trim(), {
        model: "claude-3-haiku-20240307",
        maxTokens: 500,
        temperature: 0.7,
        systemPrompt,
        correlationId,
        requestType: "chat",
        agentId: "ai-chat",
      });
      response = result.text || "Sorry, I couldn't generate a response.";

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
          max_tokens: 500,
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
          request_type: "chat",
          agent_id: "ai-chat",
          correlation_id: correlationId,
        }).catch(() => {});
        throw new Error(`OpenAI API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      response = result.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

      // Track OpenAI usage
      trackUsage({
        provider: "openai",
        model: "gpt-3.5-turbo",
        input_tokens: result.usage?.prompt_tokens ?? 0,
        output_tokens: result.usage?.completion_tokens ?? 0,
        latency_ms: latencyMs,
        request_type: "chat",
        agent_id: "ai-chat",
        correlation_id: correlationId,
      }).catch((e) => console.error("[ai-chat] openai usage tracking failed:", e));
    }

    const successResponse = NextResponse.json({
      ok: true,
      response,
      video_id,
      correlation_id: correlationId,
    });
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
