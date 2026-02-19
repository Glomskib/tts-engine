/**
 * AI Help Bot Chat API
 * POST /api/help/chat
 *
 * Accepts user message + chat history, returns AI response using Claude Haiku.
 * System prompt loaded from FlashFlow knowledge base.
 */

import { NextResponse } from "next/server";
import { FLASHFLOW_KNOWLEDGE_BASE } from "@/lib/flashflow-knowledge";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits } from "@/lib/rate-limit";
import { callAnthropicAPI } from "@/lib/ai/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

const SYSTEM_PROMPT = `${FLASHFLOW_KNOWLEDGE_BASE}

---

## System Instructions

You are FlashFlow's support assistant. Your role is to help users understand and use FlashFlow.

**Guidelines:**
- ONLY answer questions about FlashFlow features, pricing, billing, troubleshooting, and getting started
- If asked about anything NOT related to FlashFlow, respond with: "I can only help with FlashFlow questions! Ask me about features, plans, credits, or troubleshooting."
- Be concise and helpful (2-3 sentences max unless more detail is needed)
- Reference specific pages when relevant (e.g., "check /admin/billing for your credits")
- If you don't know something, say: "I'm not sure about that — please submit a support ticket below."
- Use friendly, professional tone
- Do not use markdown headers in responses`;

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Rate limit: 20 messages per minute
  const rateLimited = enforceRateLimits(
    { userId: auth.user.id },
    correlationId,
    { userLimit: 20 },
  );
  if (rateLimited) return rateLimited;

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid JSON", 400, correlationId);
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return createApiErrorResponse("VALIDATION_ERROR", "message is required", 400, correlationId);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return createApiErrorResponse("INTERNAL", "ANTHROPIC_API_KEY not configured", 500, correlationId);
  }

  // Build messages array: history + current message, limit to last 20 turns
  const messages = [
    ...history.slice(-18),
    { role: "user" as const, content: message.trim() },
  ];

  try {
    // callAnthropicAPI expects a single prompt; combine the last user message
    // For multi-turn, we pass the conversation via the prompt since the wrapper
    // uses a single user message. The system prompt is handled separately.
    const conversationPrompt = messages.length > 1
      ? messages.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n")
      : message.trim();

    const result = await callAnthropicAPI(conversationPrompt, {
      model: "claude-haiku-4-5-20251001",
      maxTokens: 512,
      systemPrompt: SYSTEM_PROMPT,
      correlationId,
      requestType: "help_chat",
      agentId: "help-bot",
      signal: AbortSignal.timeout(25000),
    });

    const assistantText = result.text || "Sorry, I couldn't generate a response. Please try again.";

    return NextResponse.json({
      ok: true,
      response: assistantText,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Help chat error:`, err);
    return createApiErrorResponse("INTERNAL", "Failed to generate response", 500, correlationId);
  }
}
