/**
 * AI Help Bot Chat API
 * POST /api/help/chat
 *
 * Accepts user message + chat history, returns AI response using Claude Haiku
 * System prompt: FlashFlow knowledge base + support assistant instructions
 */

import { Anthropic } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { FLASHFLOW_KNOWLEDGE_BASE } from "@/lib/flashflow-knowledge";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

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

export async function POST(request: Request) {
  try {
    // Auth check - optional, but preferred for tracking
    const authContext = await getApiAuthContext(request);
    const userId = authContext?.user?.id;

    const body = (await request.json()) as ChatRequest;
    const { message, history = [] } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required and must be non-empty" },
        { status: 400 }
      );
    }

    // Initialize Anthropic client
    const client = new Anthropic();

    // Build conversation history for API
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history,
      { role: "user", content: message.trim() },
    ];

    // System prompt: Knowledge base + assistant instructions
    const systemPrompt = `${FLASHFLOW_KNOWLEDGE_BASE}

---

## System Instructions for This Conversation

You are FlashFlow's support assistant. Your role is to help users understand and use FlashFlow.

**Guidelines:**
- ONLY answer questions about FlashFlow features, pricing, billing, troubleshooting, and getting started
- If asked about anything NOT related to FlashFlow (other products, general questions, etc.), respond with: "I can only help with FlashFlow questions! For other topics, try a general search engine."
- Be concise and helpful (2-3 sentences max unless more detail is needed)
- Link to specific features when relevant (e.g., "check Winners Bank for product metrics")
- If you don't know something, direct them to support: "I'm not sure about that. Please contact support@flashflowai.com"
- Use friendly, professional tone
- Assume user is busy — get to the point fast

**Common Redirects:**
- Billing issues → support@flashflowai.com or contact Billing Support
- Account access issues → Try "Forgot Password" or email support@flashflowai.com
- Feature requests → Direct to features@flashflowai.com
- Bug reports → Direct to bugs@flashflowai.com

Start each conversation with context of what the user is trying to do.`;

    // Call Claude Haiku for cost efficiency
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    // Extract text response
    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    if (!assistantMessage) {
      return NextResponse.json(
        { error: "Failed to generate response" },
        { status: 500 }
      );
    }

    // Log request for analytics (optional)
    if (userId) {
      console.log(`[help/chat] User ${userId} asked: "${message.substring(0, 100)}..."`);
    }

    return NextResponse.json({
      response: assistantMessage,
      ok: true,
    });
  } catch (err) {
    console.error("[help/chat] Error:", err);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
