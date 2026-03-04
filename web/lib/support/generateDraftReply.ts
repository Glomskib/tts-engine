/**
 * Generates an AI draft reply for a support thread using Claude.
 */

import { callAnthropicJSON } from '@/lib/ai/anthropic';

export interface DraftReplyResult {
  reply_text: string;
  confidence_score: number;
  suggested_tags: string[];
}

const DRAFT_REPLY_SYSTEM_PROMPT = `You are an expert support agent for FlashFlow, an AI-powered script generation platform for TikTok Shop affiliates.

Your job is to draft a helpful reply to the customer's latest message based on the conversation history and knowledge base provided.

## Guidelines
- Be professional, concise, and empathetic
- Keep replies to 2-5 sentences unless a detailed explanation is genuinely needed
- Suggest a concrete next action for the customer
- Reference specific FlashFlow features when relevant
- NEVER promise billing actions (refunds, trial extensions, plan changes) — instead direct them to billing@flashflowai.com or say an admin will follow up
- NEVER hallucinate features not described in the knowledge base
- If you don't know the answer, be honest and suggest contacting support@flashflowai.com
- If the user seems frustrated, acknowledge their frustration before helping

## Response Format
Respond with valid JSON only:
{
  "reply_text": "Your drafted reply to the customer",
  "confidence_score": 0.0-1.0,
  "suggested_tags": ["relevant", "tags"]
}

confidence_score guidelines:
- 0.8-1.0: Clear question with a definitive answer from the knowledge base
- 0.5-0.79: Reasonable answer but may need admin review
- 0.0-0.49: Uncertain, complex billing issue, or edge case — admin should heavily edit`;

export async function generateDraftReply(
  contextPrompt: string,
  options?: { correlationId?: string },
): Promise<DraftReplyResult> {
  try {
    const { parsed } = await callAnthropicJSON<DraftReplyResult>(contextPrompt, {
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: DRAFT_REPLY_SYSTEM_PROMPT,
      temperature: 0.3,
      maxTokens: 1024,
      requestType: 'support_draft_reply',
      agentId: 'support-draft',
      correlationId: options?.correlationId,
      signal: AbortSignal.timeout(25_000),
    });

    return {
      reply_text: parsed.reply_text || '',
      confidence_score: typeof parsed.confidence_score === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence_score))
        : 0.5,
      suggested_tags: Array.isArray(parsed.suggested_tags)
        ? parsed.suggested_tags.filter((t): t is string => typeof t === 'string')
        : [],
    };
  } catch (err) {
    // If JSON parsing failed but we got text back, use it as the reply
    if (err instanceof SyntaxError) {
      return {
        reply_text: String(err.message).includes('JSON')
          ? 'Unable to generate draft — please try again.'
          : 'Unable to generate draft — please try again.',
        confidence_score: 0.5,
        suggested_tags: [],
      };
    }
    throw err;
  }
}
