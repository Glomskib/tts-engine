/**
 * POST /api/transcribe/generate-script
 *
 * Generates a full production script from a transcribed video.
 * Uses the transcript + analysis as creative context, then feeds
 * through the unified script generator for quality + structure.
 */

import { NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { callAnthropicAPI } from '@/lib/ai/anthropic';
import { aiRouteGuard } from '@/lib/ai-route-guard';
import { buildVibePromptContext } from '@/lib/vibe-analysis/prompt-context';
import type { VibeAnalysis } from '@/lib/vibe-analysis/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface GenerateScriptRequest {
  transcript: string;
  analysis?: {
    hook?: { line: string; style: string; strength: number };
    content?: { format: string; pacing: string; structure: string };
    keyPhrases?: string[];
    emotionalTriggers?: string[];
    whatWorks?: string[];
    targetEmotion?: string;
  };
  /** What angle/approach to take */
  angle?: string;
  /** Target persona */
  persona?: string;
  /** Voice tone */
  tone?: string;
  /** Optional product to promote */
  productName?: string;
  /** Target length */
  targetLength?: '15_sec' | '30_sec' | '45_sec' | '60_sec';
  /** Additional user instructions */
  instructions?: string;
  /** Vibe analysis from the reference video */
  vibe_analysis?: Record<string, unknown>;
}

interface GeneratedScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  full_script: string;
  on_screen_text: string[];
  filming_notes: string;
  estimated_length: string;
  angle_used: string;
  persona_used: string;
  tone_used: string;
}

export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 2, userLimit: 6 });
  if (guard.error) return guard.error;
  const { correlationId } = guard;

  let body: GenerateScriptRequest;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const { transcript, analysis, angle, persona, tone, productName, targetLength, instructions, vibe_analysis } = body;

  if (!transcript?.trim()) {
    return createApiErrorResponse('BAD_REQUEST', 'Transcript is required', 400, correlationId);
  }

  const lengthGuide: Record<string, string> = {
    '15_sec': '40-60 words, punchy and fast',
    '30_sec': '80-120 words, hook + one key point + CTA',
    '45_sec': '130-180 words, full story arc',
    '60_sec': '180-250 words, detailed with setup/body/CTA',
  };

  const targetLengthDesc = lengthGuide[targetLength || '30_sec'] || lengthGuide['30_sec'];

  let systemPrompt = `You are a TikTok script writer for FlashFlow. You generate production-ready scripts inspired by transcribed videos.

TASK: Write a new original script inspired by the source transcript below. Do NOT copy the transcript — use it as creative fuel.

OUTPUT FORMAT: Return ONLY valid JSON matching this schema:
{
  "hook": "Opening hook line (first 3 seconds)",
  "setup": "Problem/context setup (next 5-10 seconds)",
  "body": "Main content/pitch/story",
  "cta": "Call to action",
  "full_script": "Complete spoken script from start to finish",
  "on_screen_text": ["Text overlay 1", "Text overlay 2", ...],
  "filming_notes": "Brief filming/editing direction",
  "estimated_length": "Estimated video length"
}

RULES:
1. The script must be ORIGINAL — inspired by but not copying the source.
2. Target length: ${targetLengthDesc}.
3. Write for spoken delivery — conversational, not written prose.
4. The hook must grab attention in under 3 seconds.
5. Include 2-4 on-screen text overlays that reinforce key points.
6. full_script should be the complete voiceover from hook through CTA.

=== SOURCE TRANSCRIPT ===
${transcript.slice(0, 3000)}
=== END TRANSCRIPT ===`;

  if (analysis) {
    systemPrompt += `\n\n=== SOURCE ANALYSIS ===`;
    if (analysis.hook) {
      systemPrompt += `\nOriginal Hook: "${analysis.hook.line}" (${analysis.hook.style}, ${analysis.hook.strength}/10)`;
    }
    if (analysis.content) {
      systemPrompt += `\nFormat: ${analysis.content.format} | Pacing: ${analysis.content.pacing}`;
    }
    if (analysis.whatWorks?.length) {
      systemPrompt += `\nWhat Works: ${analysis.whatWorks.join('; ')}`;
    }
    if (analysis.emotionalTriggers?.length) {
      systemPrompt += `\nEmotional Triggers: ${analysis.emotionalTriggers.join(', ')}`;
    }
    systemPrompt += `\n=== END ANALYSIS ===`;
  }

  // Inject vibe analysis if present
  if (vibe_analysis && typeof vibe_analysis === 'object' && (vibe_analysis as Record<string, unknown>).delivery_style) {
    systemPrompt += `\n\n${buildVibePromptContext(vibe_analysis as unknown as VibeAnalysis)}`;
  }

  let userPrompt = 'Generate a production-ready TikTok script based on this transcript.';

  if (angle) userPrompt += `\nAngle: ${angle}`;
  if (persona) userPrompt += `\nPersona voice: ${persona}`;
  if (tone) userPrompt += `\nTone: ${tone}`;
  if (productName) userPrompt += `\nProduct to promote: ${productName}`;
  if (instructions) userPrompt += `\nAdditional instructions: ${instructions}`;

  try {
    const result = await callAnthropicAPI(userPrompt, {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 1500,
      temperature: 0.8,
      systemPrompt,
      correlationId,
      requestType: 'transcript-script-gen',
      agentId: 'transcriber-workspace',
    });

    // Parse JSON from response
    let parsed: GeneratedScript;
    try {
      let text = result.text.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1);
      }
      parsed = JSON.parse(text) as GeneratedScript;
    } catch {
      // Fallback: return raw text as full_script
      parsed = {
        hook: '',
        setup: '',
        body: '',
        cta: '',
        full_script: result.text,
        on_screen_text: [],
        filming_notes: '',
        estimated_length: targetLength || '30_sec',
        angle_used: angle || 'general',
        persona_used: persona || 'default',
        tone_used: tone || 'conversational',
      };
    }

    // Ensure metadata fields
    parsed.angle_used = angle || 'general';
    parsed.persona_used = persona || 'default';
    parsed.tone_used = tone || 'conversational';

    return NextResponse.json({
      ok: true,
      data: parsed,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] generate-script error:`, err);
    return createApiErrorResponse(
      'AI_ERROR',
      err instanceof Error ? err.message : 'Script generation failed',
      500,
      correlationId,
    );
  }
}
