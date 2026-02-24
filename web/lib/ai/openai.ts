/**
 * Centralized OpenAI wrapper for FlashFlow.
 *
 * Mirrors the pattern of lib/ai/anthropic.ts — all calls go through
 * callOpenAI() which auto-logs usage to ff_usage_events.
 *
 * Usage:
 *   const result = await callOpenAI({
 *     model: 'gpt-4o-mini',
 *     messages: [...],
 *     lane: 'flashflow',
 *     agentId: 'hook-generator',
 *     templateKey: 'hook-gen-v1',
 *   });
 *   // result.content — the assistant reply
 *   // result.usage   — { input_tokens, output_tokens }
 */
import OpenAI from 'openai';
import { logUsageEventAsync } from '@/lib/finops/log-usage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface CallOpenAIOptions {
  model?: string;
  messages: OpenAI.ChatCompletionMessageParam[];
  temperature?: number;
  max_tokens?: number;
  /** Business lane for cost attribution */
  lane?: string;
  /** Agent or feature that made the call */
  agentId?: string;
  /** Template / prompt version key */
  templateKey?: string;
  /** Authenticated user ID */
  userId?: string;
}

export interface CallOpenAIResult {
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export async function callOpenAI(opts: CallOpenAIOptions): Promise<CallOpenAIResult> {
  const model       = opts.model       ?? 'gpt-4o-mini';
  const lane        = opts.lane        ?? 'flashflow';
  const agentId     = opts.agentId     ?? 'openai-wrapper';
  const templateKey = opts.templateKey ?? undefined;
  const start       = Date.now();

  const completion = await openai.chat.completions.create({
    model,
    messages: opts.messages,
    temperature: opts.temperature,
    max_tokens: opts.max_tokens,
  });

  const latency_ms     = Date.now() - start;
  const input_tokens   = completion.usage?.prompt_tokens     ?? 0;
  const output_tokens  = completion.usage?.completion_tokens ?? 0;
  const content        = completion.choices[0]?.message?.content ?? '';

  logUsageEventAsync({
    source: 'flashflow',
    lane,
    provider: 'openai',
    model,
    input_tokens,
    output_tokens,
    agent_id: agentId,
    user_id: opts.userId,
    template_key: templateKey,
    latency_ms,
    estimated: false,
  });

  return { content, usage: { input_tokens, output_tokens }, model };
}
