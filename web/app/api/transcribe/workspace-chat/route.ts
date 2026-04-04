/**
 * POST /api/transcribe/workspace-chat
 *
 * Transcript-grounded AI chat for the Transcriber Workspace.
 * The AI has full context of the transcript + analysis and helps
 * the user iterate on scripts, hooks, angles, and content strategy.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { callAnthropicAPI } from '@/lib/ai/anthropic';
import { enforceRateLimits, extractRateLimitContext } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface WorkspaceChatRequest {
  message: string;
  transcript: string;
  analysis?: {
    hook?: { line: string; style: string; strength: number };
    content?: { format: string; pacing: string; structure: string };
    keyPhrases?: string[];
    emotionalTriggers?: string[];
    whatWorks?: string[];
    targetEmotion?: string;
  };
  rewriteResult?: {
    rewritten_hook: string;
    rewritten_script: string;
    cta: string;
    persona_used: string;
    tone_used: string;
  };
  generatedScript?: string;
  history?: ChatMessage[];
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);

  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Sign in required', 401, correlationId);
  }

  // Rate limiting
  const rateLimitContext = {
    userId: auth.user.id,
    orgId: null,
    ...extractRateLimitContext(request),
  };
  const rateLimitResponse = enforceRateLimits(rateLimitContext, correlationId);
  if (rateLimitResponse) return rateLimitResponse;

  let body: WorkspaceChatRequest;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { message, transcript, analysis, rewriteResult, generatedScript, history } = body;

  if (!message?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'Message is required', 400, correlationId);
  }

  if (!transcript?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'Transcript context is required', 400, correlationId);
  }

  // Build grounded system prompt
  let systemPrompt = `You are a TikTok content strategist embedded in FlashFlow's Transcriber Workspace.
You have full context of a transcribed video and help the user turn it into their own content.

Your strengths:
- Analyzing what makes the original video work
- Suggesting angles, hooks, and scripts inspired by the transcript
- Iterating on rewrites and generated scripts
- Giving specific, actionable creative direction
- Identifying product opportunities and content gaps

RULES:
1. Keep responses SHORT and actionable — 2-4 paragraphs max.
2. When suggesting hooks, give 2-3 specific options.
3. Reference the transcript directly when relevant.
4. If the user has a generated script, help them improve it.
5. Never be generic — ground everything in what you see in the transcript.

=== ORIGINAL TRANSCRIPT ===
${transcript.slice(0, 3000)}
=== END TRANSCRIPT ===`;

  if (analysis) {
    systemPrompt += `\n\n=== VIDEO ANALYSIS ===`;
    if (analysis.hook) {
      systemPrompt += `\nHook: "${analysis.hook.line}" (${analysis.hook.style}, strength ${analysis.hook.strength}/10)`;
    }
    if (analysis.content) {
      systemPrompt += `\nFormat: ${analysis.content.format} | Pacing: ${analysis.content.pacing} | Structure: ${analysis.content.structure}`;
    }
    if (analysis.keyPhrases?.length) {
      systemPrompt += `\nKey Phrases: ${analysis.keyPhrases.join(', ')}`;
    }
    if (analysis.whatWorks?.length) {
      systemPrompt += `\nWhat Works: ${analysis.whatWorks.join('; ')}`;
    }
    if (analysis.emotionalTriggers?.length) {
      systemPrompt += `\nEmotional Triggers: ${analysis.emotionalTriggers.join(', ')}`;
    }
    if (analysis.targetEmotion) {
      systemPrompt += `\nTarget Emotion: ${analysis.targetEmotion}`;
    }
    systemPrompt += `\n=== END ANALYSIS ===`;
  }

  if (rewriteResult) {
    systemPrompt += `\n\n=== CURRENT REWRITE ===
Hook: "${rewriteResult.rewritten_hook}"
Script: ${rewriteResult.rewritten_script.slice(0, 1500)}
CTA: ${rewriteResult.cta}
Persona: ${rewriteResult.persona_used} | Tone: ${rewriteResult.tone_used}
=== END REWRITE ===`;
  }

  if (generatedScript) {
    systemPrompt += `\n\n=== GENERATED SCRIPT (user is working on this) ===
${generatedScript.slice(0, 2000)}
=== END GENERATED SCRIPT ===`;
  }

  try {
    // Build messages array from history
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (history?.length) {
      // Keep last 10 messages for context
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message.trim().slice(0, 2000) });

    // Use multi-turn via callAnthropicAPI
    // Since callAnthropicAPI takes a single user prompt, we'll format history into the prompt
    let userPrompt = '';
    if (messages.length > 1) {
      // Format prior turns into the prompt
      for (let i = 0; i < messages.length - 1; i++) {
        const m = messages[i];
        userPrompt += `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}\n\n`;
      }
      userPrompt += `User: ${messages[messages.length - 1].content}`;
    } else {
      userPrompt = messages[0].content;
    }

    const result = await callAnthropicAPI(userPrompt, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 800,
      temperature: 0.7,
      systemPrompt,
      correlationId,
      requestType: 'workspace-chat',
      agentId: 'transcriber-workspace',
    });

    return NextResponse.json({
      ok: true,
      response: result.text,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] workspace-chat error:`, err);
    return createApiErrorResponse(
      'AI_ERROR',
      err instanceof Error ? err.message : 'AI chat failed',
      500,
      correlationId,
    );
  }
}
