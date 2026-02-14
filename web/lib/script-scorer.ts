/**
 * Script Scorer
 *
 * Uses Claude Haiku to evaluate UGC scripts on 5 dimensions.
 * Returns structured scores with feedback and improvement suggestions.
 * Threshold: 7/10 average to proceed — under 7, the orchestrator regenerates.
 */

export interface ScriptScoreInput {
  script: string;
  persona: string;
  product: string;
  hook: string;
}

export interface ScriptScores {
  hook_strength: number;
  authenticity: number;
  persona_match: number;
  emotional_trigger: number;
  call_to_action: number;
}

export interface ScriptScoreResult {
  totalScore: number;
  scores: ScriptScores;
  feedback: string;
  suggestedImprovements: string[];
  passed: boolean;
  model: string;
  scored_at: string;
}

const PASS_THRESHOLD = 7;

/**
 * Score a UGC script using Claude Haiku.
 * Returns structured scores, feedback, and pass/fail.
 */
export async function scoreScript(input: ScriptScoreInput): Promise<ScriptScoreResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const prompt = `You are a UGC (user-generated content) script evaluator for TikTok/Reels product videos.

Score this script on 5 dimensions, each 1-10 (10 = exceptional):

1. HOOK STRENGTH — Would the first line stop someone mid-scroll? Does it create instant curiosity or tension?
2. AUTHENTICITY — Does this sound like a real person talking to a friend, NOT a polished ad? Natural language, contractions, casual tone.
3. PERSONA MATCH — Does the voice match the target persona? Would this persona actually say these words?
4. EMOTIONAL TRIGGER — Does it tap into a real pain point, desire, fear, or aspiration? Does the viewer feel seen?
5. CALL TO ACTION — Is there a natural, non-pushy close that drives action? Does it feel organic?

PRODUCT: ${input.product}
TARGET PERSONA: ${input.persona}
HOOK LINE: ${input.hook}

FULL SCRIPT:
${input.script}

Respond in ONLY valid JSON (no markdown, no explanation):
{
  "scores": {
    "hook_strength": <1-10>,
    "authenticity": <1-10>,
    "persona_match": <1-10>,
    "emotional_trigger": <1-10>,
    "call_to_action": <1-10>
  },
  "feedback": "<2-3 sentence overall assessment>",
  "suggestedImprovements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"]
}

Be critical. A 7 is good. An 8 is strong. A 9-10 is exceptional and rare. Most scripts should land 5-8.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find(
    (b: { type: string; text?: string }) => b.type === 'text'
  );
  const raw = (textBlock?.text || '').trim();

  // Parse JSON from response (handle potential markdown wrapping)
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('Scorer returned no valid JSON');
  }

  const parsed = JSON.parse(raw.substring(firstBrace, lastBrace + 1));

  const scores: ScriptScores = {
    hook_strength: clamp(parsed.scores?.hook_strength ?? 5),
    authenticity: clamp(parsed.scores?.authenticity ?? 5),
    persona_match: clamp(parsed.scores?.persona_match ?? 5),
    emotional_trigger: clamp(parsed.scores?.emotional_trigger ?? 5),
    call_to_action: clamp(parsed.scores?.call_to_action ?? 5),
  };

  const totalScore = round(
    (scores.hook_strength +
      scores.authenticity +
      scores.persona_match +
      scores.emotional_trigger +
      scores.call_to_action) /
      5
  );

  return {
    totalScore,
    scores,
    feedback: parsed.feedback || '',
    suggestedImprovements: Array.isArray(parsed.suggestedImprovements)
      ? parsed.suggestedImprovements.map(String)
      : [],
    passed: totalScore >= PASS_THRESHOLD,
    model: 'claude-haiku-4-5-20251001',
    scored_at: new Date().toISOString(),
  };
}

/** Extract scoreable text from a skit's skit_data. */
export function extractScriptFromSkit(skitData: {
  hook_line?: string;
  beats?: Array<{ dialogue?: string; action?: string; on_screen_text?: string }>;
  cta_line?: string;
  cta_overlay?: string;
}): { script: string; hook: string } {
  const lines: string[] = [];

  // Collect beat dialogues as the canonical script source
  const beatDialogues: string[] = [];
  for (const beat of skitData.beats || []) {
    if (beat.dialogue) beatDialogues.push(beat.dialogue);
    else if (beat.action) beatDialogues.push(beat.action);
  }

  if (beatDialogues.length > 0) {
    // Beats exist — use them as the script (hook_line may be a summary/duplicate)
    lines.push(...beatDialogues);
    // Only add cta_line if it's not already the last beat's dialogue
    if (skitData.cta_line && skitData.cta_line !== beatDialogues[beatDialogues.length - 1]) {
      lines.push(skitData.cta_line);
    }
  } else {
    // No beats — fall back to hook_line + cta_line
    if (skitData.hook_line) lines.push(skitData.hook_line);
    if (skitData.cta_line) lines.push(skitData.cta_line);
  }

  // Hook = first beat's dialogue (the actual opening hook), or hook_line as fallback
  const hook = beatDialogues[0] || skitData.hook_line || '';

  return { script: lines.join(' '), hook };
}

function clamp(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
