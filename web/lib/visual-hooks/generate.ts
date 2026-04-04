/**
 * Visual Hook generation — filmable first-shot ideas.
 *
 * Uses OpenAI to generate specific, practical visual hook ideas
 * that creators can actually film in the first 1-3 seconds.
 */

import type { VisualHookRequest, VisualHookIdea, VibeContext } from './types';

const PLATFORM_CONTEXT: Record<string, string> = {
  tiktok: 'TikTok — maximum pattern interrupt, fast pacing. First 1-3 seconds decide everything. Vertical video, phone-native.',
  youtube_shorts: 'YouTube Shorts — promise value upfront, retention-focused. Vertical, slightly more polished than TikTok.',
  instagram_reels: 'Instagram Reels — aesthetic-forward, aspirational. Visual appeal is critical. Vertical, clean framing.',
};

const SHOT_TYPES = ['close-up', 'wide', 'pov', 'overhead', 'split-screen', 'screen-record', 'text-first'] as const;
const ENERGIES = ['calm', 'punchy', 'dramatic', 'comedic', 'mysterious'] as const;

/**
 * Build vibe context block for the prompt.
 */
function buildVibeBlock(vibe: VibeContext): string {
  const lines: string[] = [
    '\n=== REFERENCE VIDEO VIBE (match this energy and rhythm) ===',
  ];

  if (vibe.delivery_style) lines.push(`Delivery: ${vibe.delivery_style}`);
  if (vibe.pacing_style) lines.push(`Pacing: ${vibe.pacing_style}`);
  if (vibe.hook_energy) lines.push(`Hook energy: ${vibe.hook_energy}`);
  if (vibe.visual_style) lines.push(`Visual style: ${vibe.visual_style}`);
  if (vibe.visual_rhythm) lines.push(`Visual rhythm: ${vibe.visual_rhythm}`);
  if (vibe.reveal_timing) lines.push(`Reveal timing: ${vibe.reveal_timing}`);

  if (vibe.timing_arc) {
    const arc = vibe.timing_arc;
    lines.push(`Timing: hook ends ~${arc.hook_ends_at}s, proof reveal ~${arc.proof_reveal_at}s, CTA ~${arc.cta_starts_at}s`);
  }

  if (vibe.recreate_guidance?.length) {
    lines.push('');
    lines.push('Recreate this feel:');
    for (const tip of vibe.recreate_guidance) {
      lines.push(`  - ${tip}`);
    }
  }

  // Map vibe to specific visual direction
  lines.push('');
  if (vibe.visual_rhythm === 'fast_cut' || vibe.visual_rhythm === 'Fast-cut') {
    lines.push('VISUAL DIRECTION: Use quick cuts and fast transitions. Multiple shots in the first 3 seconds.');
  } else if (vibe.visual_rhythm === 'static' || vibe.visual_rhythm === 'Static / single shot') {
    lines.push('VISUAL DIRECTION: Single sustained shot. Power comes from the content of the frame, not the editing.');
  } else if (vibe.visual_rhythm === 'slow_cut' || vibe.visual_rhythm === 'Slow & steady') {
    lines.push('VISUAL DIRECTION: Slow, deliberate opening. Let one strong image breathe.');
  }

  if (vibe.hook_energy === 'immediate' || vibe.hook_energy === 'Immediate') {
    lines.push('HOOK ENERGY: Hit hard in frame 1. No buildup, no pause. The opening IS the hook.');
  } else if (vibe.hook_energy === 'building' || vibe.hook_energy === 'Building') {
    lines.push('HOOK ENERGY: Start with a quiet or curious setup that builds into the reveal.');
  } else if (vibe.hook_energy === 'delayed' || vibe.hook_energy === 'Delayed') {
    lines.push('HOOK ENERGY: Slow burn opener. The tension comes from what the viewer THINKS is about to happen.');
  }

  lines.push('===');
  return lines.join('\n');
}

export function buildVisualHookPrompt(req: VisualHookRequest): { system: string; user: string } {
  const count = req.count || 6;
  const platformCtx = PLATFORM_CONTEXT[req.platform || 'tiktok'] || PLATFORM_CONTEXT.tiktok;
  const vibeBlock = req.vibe ? buildVibeBlock(req.vibe) : '';

  const system = `You are a short-form video director who specializes in scroll-stopping openings. You've studied thousands of top-performing TikToks and know exactly what makes someone stop and watch.

YOUR JOB: Generate ${count} specific, filmable visual hook ideas for the first 1-3 seconds of a short-form video.

RULES — READ CAREFULLY:

1. Every "action" must be SPECIFIC and FILMABLE. A creator reading this should know EXACTLY what to do with their camera.
   - BAD: "Show the product" / "Person holding item" / "Display product on camera" / "Creator talks to camera"
   - GOOD: "Pour dark soda into a glass, hold it up to the light, then cut to clear water"
   - GOOD: "Dump cluttered supplements on the table, then isolate the one you actually use"
   - GOOD: "Screen-record a negative comment, then hard-cut to your reaction with the product"

2. Each idea must use a DIFFERENT shot_type from: ${SHOT_TYPES.join(', ')}

3. Each idea must use a DIFFERENT energy from: ${ENERGIES.join(', ')} (reuse is ok if you need more than 5)

4. "setup" should list the actual props and location needed. Keep it realistic — kitchen table, bathroom mirror, desk, car.

5. "pairs_with" is an optional verbal hook suggestion. If provided, make it sound like a real person talking, not marketing copy.

6. NEVER output these generic visuals:
   - "person holds/shows/displays product"
   - "creator unboxes item"
   - "someone looking at camera"
   - "aesthetic flat lay"
   - "product on clean background"
   - any description that could apply to ANY product

7. Think about the CONTRAST or TENSION in the visual. Great openings show:
   - unexpected juxtaposition (trash product next to good one)
   - mid-action moments (already pouring, already messy, already reacting)
   - something slightly wrong or surprising
   - a result before the explanation

8. Keep "why_it_works" to one punchy sentence explaining the psychological trigger.

9. Also return a "strength" field (integer 1-5) rating how scroll-stopping this visual idea is:
   5 = genuinely surprising or visually arresting
   4 = strong pattern interrupt or contrast
   3 = solid but somewhat expected
   2 = decent but could apply to many products
   1 = functional but not exciting

Platform: ${platformCtx}
${req.niche ? `Niche: ${req.niche}` : ''}
${req.verbal_hook ? `\nExisting verbal hook to pair with: "${req.verbal_hook}"\nMake visual ideas that SET UP or CONTRAST with this verbal hook.` : ''}
${req.script_context ? `\nScript context: ${req.script_context}\nVisual ideas should open into this script naturally.` : ''}${vibeBlock}

Return ONLY a valid JSON array of ${count} objects:
[
  {
    "action": "...",
    "shot_type": "close-up",
    "setup": "...",
    "pairs_with": "...",
    "energy": "punchy",
    "why_it_works": "...",
    "strength": 4
  }
]

No markdown, no explanation — only the JSON array.`;

  const user = `Product/Topic: ${req.topic.trim()}`;

  return { system, user };
}

// ── Ranking ──────────────────────────────────────────────────────

/**
 * Tension/contrast words that signal stronger visual hooks.
 */
const TENSION_WORDS = ['then', 'but', 'cut to', 'instead', 'before', 'after', 'versus', 'while', 'mid-', 'already', 'suddenly', 'reveal', 'flip', 'swap', 'toss', 'dump', 'smash', 'rip'];

/**
 * Score a visual hook idea on filmability and specificity.
 * Returns 0-100. Higher = stronger idea.
 */
export function scoreVisualHook(idea: VisualHookIdea, vibe?: VibeContext): number {
  let score = 50; // base

  // Model's self-rating (strength 1-5 → 0-20 points)
  if (idea.strength) {
    score += (idea.strength - 3) * 10; // 5→+20, 4→+10, 3→0, 2→-10, 1→-20
  }

  // Specificity: action word count (sweet spot 10-25 words)
  const wordCount = idea.action.split(/\s+/).length;
  if (wordCount >= 10 && wordCount <= 25) score += 10;
  else if (wordCount >= 8) score += 5;
  else if (wordCount < 6) score -= 10;

  // Tension/contrast words
  const actionLower = idea.action.toLowerCase();
  let tensionHits = 0;
  for (const word of TENSION_WORDS) {
    if (actionLower.includes(word)) tensionHits++;
  }
  score += Math.min(tensionHits * 5, 15); // max 15 from tension

  // Props specificity: more concrete props = more filmable
  const setupWords = idea.setup.split(/\s+/).length;
  if (setupWords >= 5) score += 5;

  // Verbal pairing bonus
  if (idea.pairs_with && idea.pairs_with.length > 10) score += 5;

  // Vibe match bonus
  if (vibe) {
    // Energy alignment
    const vibeEnergyMap: Record<string, string[]> = {
      'immediate': ['punchy', 'dramatic'],
      'Immediate': ['punchy', 'dramatic'],
      'building': ['mysterious', 'calm'],
      'Building': ['mysterious', 'calm'],
      'delayed': ['calm', 'mysterious'],
      'Delayed': ['calm', 'mysterious'],
    };
    const matchingEnergies = vibeEnergyMap[vibe.hook_energy || ''] || [];
    if (matchingEnergies.includes(idea.energy)) score += 10;

    // Visual rhythm alignment
    if ((vibe.visual_rhythm === 'fast_cut' || vibe.visual_rhythm === 'Fast-cut') &&
        (actionLower.includes('cut') || actionLower.includes('then'))) {
      score += 5;
    }
    if ((vibe.visual_rhythm === 'static' || vibe.visual_rhythm === 'Static / single shot') &&
        !actionLower.includes('cut') && !actionLower.includes('then')) {
      score += 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Validate, score, and rank visual hook ideas from AI output.
 */
export function validateVisualHooks(raw: unknown[], vibe?: VibeContext): VisualHookIdea[] {
  const VAGUE_PATTERNS = [
    /^(person|someone|user|creator|influencer)\s+(holds?|shows?|displays?|presents?|uses?)/i,
    /^show(ing)?\s+(the\s+)?product/i,
    /^display(ing)?\s+(the\s+)?product/i,
    /^(aesthetic|clean|nice)\s+(flat\s*lay|setup|background)/i,
    /^unbox(ing)?\s+(the\s+)?(item|product)/i,
  ];

  const ideas = (raw as Record<string, unknown>[])
    .filter(item => {
      if (!item.action || typeof item.action !== 'string') return false;
      if ((item.action as string).split(/\s+/).length < 5) return false;

      // Reject vague visuals
      for (const pattern of VAGUE_PATTERNS) {
        if (pattern.test((item.action as string).trim())) return false;
      }

      return true;
    })
    .map(item => {
      const idea: VisualHookIdea = {
        action: String(item.action),
        shot_type: SHOT_TYPES.includes(item.shot_type as typeof SHOT_TYPES[number])
          ? (item.shot_type as typeof SHOT_TYPES[number])
          : 'close-up',
        setup: String(item.setup || 'Minimal — just your phone and the product'),
        pairs_with: item.pairs_with ? String(item.pairs_with) : undefined,
        energy: ENERGIES.includes(item.energy as typeof ENERGIES[number])
          ? (item.energy as typeof ENERGIES[number])
          : 'punchy',
        why_it_works: String(item.why_it_works || ''),
        strength: typeof item.strength === 'number' ? Math.max(1, Math.min(5, item.strength)) : undefined,
      };

      // Score and attach
      idea.strength = scoreVisualHook(idea, vibe);

      return idea;
    });

  // Sort by strength descending — strongest first
  ideas.sort((a, b) => (b.strength || 0) - (a.strength || 0));

  return ideas;
}
