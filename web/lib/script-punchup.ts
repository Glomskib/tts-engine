/**
 * Script Punch-Up Pass
 *
 * Lightweight second pass that sharpens a generated script.
 * Uses Claude Haiku for speed and cost.
 *
 * Targets:
 * - Weak/generic openings
 * - AI-speak and marketing language
 * - Unnatural verbal rhythm
 * - CTAs that feel bolted on
 * - Missing specificity
 */

import { callAnthropicAPI } from '@/lib/ai/anthropic';
import { checkScriptQuality } from '@/lib/script-anti-cliche';

const PUNCHUP_SYSTEM = `You are a short-form video script editor. You take decent scripts and make them sound more like real creators talking to their phone camera.

YOUR EDITS SHOULD:
1. Replace generic/marketing language with specific, casual phrasing
2. Break up too-smooth sentences into natural speech rhythms (fragments, restarts, fillers)
3. Make the CTA feel like part of the conversation, not a separate sales pitch
4. Add tiny imperfections that real people have (trailing off, self-correction, emphasis)
5. Tighten anything that wastes words
6. Keep stage directions in [brackets] intact

YOUR EDITS SHOULD NOT:
- Change the overall structure or arc
- Remove product-specific details
- Add banned phrases (game changer, life hack, trust me, I'm obsessed, etc.)
- Make it longer than the original
- Over-correct into a different persona

Return ONLY the same JSON structure as input. No markdown, no explanation.`;

export interface ScriptPunchUpInput {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  on_screen_text?: string[];
  filming_notes?: string;
}

export interface ScriptPunchUpResult {
  script: ScriptPunchUpInput;
  punchedUp: boolean;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Run a punch-up pass on a generated script.
 * Returns the improved script, or the original if the pass fails.
 */
export async function punchUpScript(
  script: ScriptPunchUpInput,
  personaName: string,
  correlationId?: string,
): Promise<ScriptPunchUpResult> {
  // Quick quality check — skip punch-up if script is already clean
  const issues = checkScriptQuality(script);
  const hasFailures = issues.some(i => i.severity === 'fail');

  if (!hasFailures && issues.length === 0) {
    // Script is clean, but still punch up for voice quality
  }

  try {
    const userPrompt = `Persona: ${personaName}

Script to edit:
${JSON.stringify(script, null, 2)}

${hasFailures ? `\nQUALITY ISSUES FOUND — fix these:\n${issues.filter(i => i.severity === 'fail').map(i => `- ${i.field}: ${i.issue}`).join('\n')}` : ''}

Return the improved script as JSON. Only change what needs improving.`;

    const result = await callAnthropicAPI(userPrompt, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1500,
      temperature: 0.6,
      systemPrompt: PUNCHUP_SYSTEM,
      correlationId,
      requestType: 'script-punchup',
      agentId: 'flash',
    });

    let text = result.text.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.substring(firstBrace, lastBrace + 1);
    }

    const improved = JSON.parse(text) as ScriptPunchUpInput;

    // Validate we got the required fields back
    if (!improved.hook && !improved.body) {
      return { script, punchedUp: false, inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens };
    }

    // Check punched-up version doesn't introduce banned phrases
    const postIssues = checkScriptQuality(improved);
    const postFailures = postIssues.filter(i => i.severity === 'fail');
    if (postFailures.length > 0) {
      // Punch-up made it worse — return original
      return { script, punchedUp: false, inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens };
    }

    return {
      script: {
        hook: improved.hook || script.hook,
        setup: improved.setup || script.setup,
        body: improved.body || script.body,
        cta: improved.cta || script.cta,
        on_screen_text: improved.on_screen_text || script.on_screen_text,
        filming_notes: improved.filming_notes || script.filming_notes,
      },
      punchedUp: true,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    };
  } catch (err) {
    console.error('[script-punchup] Failed, returning original:', err);
    return { script, punchedUp: false, inputTokens: 0, outputTokens: 0 };
  }
}
