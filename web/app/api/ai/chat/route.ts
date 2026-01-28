import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const { message, context, video_id } = body as ChatRequest;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Message is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return NextResponse.json(
      { ok: false, error: "AI service unavailable", correlation_id: correlationId },
      { status: 503 }
    );
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
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 500,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: "user", content: message.trim() }],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Anthropic API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      response = result.content?.[0]?.text || "Sorry, I couldn't generate a response.";

    } else if (openaiKey) {
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

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      response = result.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
    }

    return NextResponse.json({
      ok: true,
      response,
      video_id,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] AI chat error:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: `AI error: ${error instanceof Error ? error.message : String(error)}`,
        correlation_id: correlationId,
      },
      { status: 500 }
    );
  }
}
