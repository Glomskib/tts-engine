/**
 * Hook Punch-Up Pass
 *
 * Takes generated hooks and runs a fast second pass to sharpen them.
 * Targets: weaker tension, AI-speak, generic phrasing, marketing language.
 * Uses Claude Haiku for speed and cost efficiency.
 */

import { callAnthropicAPI } from '@/lib/ai/anthropic';
import type { HookData } from './hook-quality-filter';

const PUNCHUP_SYSTEM = `You are a ruthless short-form video hook editor. Your ONLY job is to make hooks sharper, more specific, and more creator-native.

FOR EACH HOOK, evaluate and rewrite ONLY if it needs improvement. If a hook is already strong, return it unchanged.

WHAT TO FIX:
1. GENERIC → SPECIFIC: "This product is amazing" → "I've been hiding this from my roommate for 3 weeks"
2. MARKETING SPEAK → CREATOR SPEAK: "Transform your routine" → "My skin literally cleared up in a week doing this"
3. WEAK TENSION → STRONG TENSION: "Here's what I found" → "My doctor told me to stop immediately"
4. SYMMETRICAL/POLISHED → RAW: "Discover the secret to..." → "Nobody is talking about this and it's pissing me off"
5. PASSIVE VISUAL → ACTIVE VISUAL: "Person holds product" → "Hands trembling as they open the package for the first time at 2am"
6. VAGUE TEXT → SPECIFIC TEXT: "You need to see this" → "3 weeks. That's all it took."

RULES:
- Keep the SAME category and psychological angle
- Keep the same approximate length
- Do NOT add banned phrases (game changer, life hack, trust me, etc.)
- Do NOT start hooks with: "So I just", "Okay so", "Hey guys", "Guys,"
- Make verbal hooks sound like a real person talking to their phone, not a copywriter
- Text on screen should create genuine curiosity or tension in under 12 words
- Visual hooks must be filmable by one person with a phone

Return ONLY a valid JSON array with the same structure as input. No markdown, no extra text.`;

/**
 * Run a punch-up pass on generated hooks.
 * Returns improved hooks, or the originals if the pass fails.
 */
export async function punchUpHooks(
  hooks: HookData[],
  product: string,
  correlationId?: string,
): Promise<{ hooks: HookData[]; punchedUp: boolean; tokens: { input: number; output: number } }> {
  if (hooks.length === 0) {
    return { hooks, punchedUp: false, tokens: { input: 0, output: 0 } };
  }

  try {
    const userPrompt = `Product/Topic: ${product}

Here are ${hooks.length} hooks to review and sharpen:

${JSON.stringify(hooks, null, 2)}

Return the improved hooks as a JSON array. Keep hooks that are already strong. Only rewrite hooks that are generic, too polished, or use AI-speak.`;

    const result = await callAnthropicAPI(userPrompt, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 2000,
      temperature: 0.7,
      systemPrompt: PUNCHUP_SYSTEM,
      correlationId,
      requestType: 'hook-punchup',
      agentId: 'flash',
    });

    // Parse response
    let text = result.text.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const firstBrace = text.indexOf('[');
    const lastBrace = text.lastIndexOf(']');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.substring(firstBrace, lastBrace + 1);
    }

    const improved = JSON.parse(text) as HookData[];

    if (!Array.isArray(improved) || improved.length === 0) {
      return { hooks, punchedUp: false, tokens: { input: result.usage.input_tokens, output: result.usage.output_tokens } };
    }

    // Normalize
    const normalized = improved.map((h) => ({
      visual_hook: h.visual_hook || '',
      text_on_screen: h.text_on_screen || '',
      verbal_hook: h.verbal_hook || '',
      strategy_note: h.why_this_works || h.strategy_note || '',
      category: h.category || '',
      why_this_works: h.why_this_works || h.strategy_note || '',
    }));

    // Validate each hook still has required fields
    const valid = normalized.filter(h =>
      h.visual_hook && h.text_on_screen && h.verbal_hook && (h.why_this_works || h.strategy_note)
    );

    if (valid.length === 0) {
      return { hooks, punchedUp: false, tokens: { input: result.usage.input_tokens, output: result.usage.output_tokens } };
    }

    return {
      hooks: valid,
      punchedUp: true,
      tokens: { input: result.usage.input_tokens, output: result.usage.output_tokens },
    };
  } catch (err) {
    console.error('[hook-punchup] Failed, returning originals:', err);
    return { hooks, punchedUp: false, tokens: { input: 0, output: 0 } };
  }
}
