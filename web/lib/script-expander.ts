/**
 * Script Expander — turns Content Package briefs into full, filmable UGC scripts.
 *
 * Flow: brief (hook + content_type + product) → AI call → FullScript object
 *
 * Uses persona rotation and sales approach matching to ensure variety across
 * a package. The AI prompt forces natural, conversational UGC language with
 * specific product details — NOT marketing copy.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FullScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  on_screen_text: string[];
  filming_notes: string;
  persona: string;
  sales_approach: string;
  estimated_length: string;
}

export interface ScriptBrief {
  hook: string;
  content_type: string;
  content_type_name: string;
  product_name: string;
  brand: string;
  product_notes?: string | null;
  product_category?: string | null;
  pain_points?: string[] | null;
}

// ---------------------------------------------------------------------------
// Personas — rotate through these so scripts don't all sound the same
// ---------------------------------------------------------------------------

export const PERSONAS = [
  {
    id: 'honest_reviewer',
    name: 'The Honest Reviewer',
    voice: 'Calm, measured, trustworthy. Speaks like someone who has tried dozens of products and finally found one worth recommending. Uses phrases like "I\'ve tried everything" and "here\'s the truth". Balanced — acknowledges downsides.',
  },
  {
    id: 'skeptic_convert',
    name: 'The Skeptic Convert',
    voice: 'Starts doubtful, ends convinced. Uses "I thought this was BS" or "my friend kept telling me to try this". Relatable because everyone has been skeptical. The conversion moment is the emotional peak.',
  },
  {
    id: 'educator',
    name: 'The Educator',
    voice: 'Confident, knowledgeable but not condescending. Drops science or facts early. "Here\'s what 90% of people don\'t know..." or "Your doctor won\'t tell you this". Makes the viewer feel smarter.',
  },
  {
    id: 'storyteller',
    name: 'The Storyteller',
    voice: 'Narrative-driven, personal. Starts with a specific moment or timeline. "3 weeks ago I could barely..." or "Last month I was scrolling and...". Draws the viewer into a journey with a payoff.',
  },
  {
    id: 'hype_man',
    name: 'The Hype Man',
    voice: 'High energy, excited, almost disbelief. "BRO you need to see this" or "I literally can\'t stop talking about this". Unboxing energy. Infectious enthusiasm, lots of emphasis and repetition.',
  },
  {
    id: 'relatable_friend',
    name: 'The Relatable Friend',
    voice: 'Casual, low-key, talking to camera like texting a friend. Uses filler words naturally ("honestly", "like", "lowkey"). No hard sell — just sharing something they genuinely use. "Okay so I have to put you guys onto something".',
  },
] as const;

// ---------------------------------------------------------------------------
// Sales Approaches — matched to content types where possible
// ---------------------------------------------------------------------------

export const SALES_APPROACHES = [
  {
    id: 'problem_solution',
    name: 'Problem/Solution',
    description: 'Lead with the pain point, present the product as the fix.',
  },
  {
    id: 'before_after',
    name: 'Before/After',
    description: 'Show the transformation — what life was like before vs after using the product.',
  },
  {
    id: 'social_proof',
    name: 'Social Proof',
    description: 'Testimonial style — "everyone keeps asking me..." or reference reviews/results.',
  },
  {
    id: 'myth_busting',
    name: 'Myth-Busting',
    description: 'Challenge a common belief, then reveal the truth (which happens to involve the product).',
  },
  {
    id: 'fomo_urgency',
    name: 'FOMO / Urgency',
    description: 'Create urgency — limited time, selling out, everyone else already knows about this.',
  },
  {
    id: 'unboxing',
    name: 'Unboxing / First Impression',
    description: 'React to the product in real-time. Show the packaging, reveal, first use.',
  },
  {
    id: 'day_in_life',
    name: 'Day-in-My-Life',
    description: 'Integrate the product naturally into a routine or daily vlog moment.',
  },
] as const;

// Bias certain content types toward specific approaches
const CONTENT_TYPE_APPROACH_HINTS: Record<string, string[]> = {
  'educational': ['myth_busting', 'problem_solution'],
  'how-to': ['problem_solution', 'before_after'],
  'testimonial': ['social_proof', 'before_after'],
  'unboxing': ['unboxing', 'fomo_urgency'],
  'transformation': ['before_after', 'storyteller'],
  'trend': ['fomo_urgency', 'social_proof'],
  'comparison': ['myth_busting', 'problem_solution'],
  'comedy': ['day_in_life', 'social_proof'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick persona, rotating to avoid repeats. */
export function pickPersona(usedPersonaIds: string[]): (typeof PERSONAS)[number] {
  // Prefer personas not yet used in this package
  const unused = PERSONAS.filter(p => !usedPersonaIds.includes(p.id));
  const pool = unused.length > 0 ? unused : [...PERSONAS];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Pick a sales approach biased by content type. */
export function pickSalesApproach(contentType: string, usedApproachIds: string[]): (typeof SALES_APPROACHES)[number] {
  const hints = CONTENT_TYPE_APPROACH_HINTS[contentType] || [];

  // Prefer hinted + unused approaches
  const hintedUnused = SALES_APPROACHES.filter(a => hints.includes(a.id) && !usedApproachIds.includes(a.id));
  if (hintedUnused.length > 0) return hintedUnused[Math.floor(Math.random() * hintedUnused.length)];

  // Fall back to any unused
  const unused = SALES_APPROACHES.filter(a => !usedApproachIds.includes(a.id));
  const pool = unused.length > 0 ? unused : [...SALES_APPROACHES];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------------------------------------------------------------------
// AI call
// ---------------------------------------------------------------------------

async function callAnthropicJSON(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[script-expander] API error:', errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) return jsonMatch[1].trim();

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];

  return text;
}

// ---------------------------------------------------------------------------
// Main expansion function
// ---------------------------------------------------------------------------

export async function expandBriefToScript(
  brief: ScriptBrief,
  persona: (typeof PERSONAS)[number],
  approach: (typeof SALES_APPROACHES)[number],
): Promise<FullScript> {

  const painPointsBlock = brief.pain_points && brief.pain_points.length > 0
    ? `\n=== KNOWN PAIN POINTS ===\n${brief.pain_points.map(p => `- ${p}`).join('\n')}`
    : '';

  const systemPrompt = `You are a UGC script writer for TikTok/short-form video. You write scripts that sound like real people talking to their phone camera — NOT marketing copy.

=== RULES ===
- Write like a real person, not a brand. Use contractions, casual language, filler words where natural.
- The hook must be filmable in 3 seconds or less — one punchy line.
- Total script should be 30-60 seconds when read aloud (roughly 80-150 words for the speaking parts).
- Include inline stage directions in brackets: [pause], [show product], [hold up bottle], [point to screen]
- Vary sentence length — short punchy lines mixed with flowing ones.
- The CTA must feel natural, not salesy. Like you're telling a friend where to find it.
- Reference SPECIFIC product details — name, what it does, key ingredients/features. No generic filler.
- on_screen_text should be 2-4 short overlays that viewers can read quickly.
- filming_notes should be practical: angle, energy level, props needed, background.

=== OUTPUT FORMAT ===
Respond with ONLY a JSON object (no markdown, no explanation):
{
  "hook": "The first 3 seconds — scroll-stopper line",
  "setup": "5-10 seconds — the problem/context that draws them in",
  "body": "15-30 seconds — the pitch/demo/story with product specifics and stage directions",
  "cta": "3-5 seconds — natural call to action",
  "on_screen_text": ["overlay 1", "overlay 2", "overlay 3"],
  "filming_notes": "Practical filming guidance: angle, energy, props, setting",
  "estimated_length": "30-45 seconds"
}`;

  const userPrompt = `Write a complete UGC TikTok script for this brief:

=== PRODUCT ===
Name: ${brief.product_name}
Brand: ${brief.brand}
Category: ${brief.product_category || 'General'}
Notes: ${brief.product_notes || 'None provided'}${painPointsBlock}

=== BRIEF ===
Hook to build from: "${brief.hook}"
Content Type: ${brief.content_type_name}

=== CREATOR PERSONA ===
${persona.name}: ${persona.voice}

=== SALES APPROACH ===
${approach.name}: ${approach.description}

Write the script now. Make it specific to ${brief.product_name} from ${brief.brand}. Sound like ${persona.name.toLowerCase()} — not a marketer.`;

  const raw = await callAnthropicJSON(systemPrompt, userPrompt);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('[script-expander] Failed to parse AI response:', raw.slice(0, 200));
    throw new Error('Failed to parse AI script response');
  }

  return {
    hook: String(parsed.hook || brief.hook),
    setup: String(parsed.setup || ''),
    body: String(parsed.body || ''),
    cta: String(parsed.cta || ''),
    on_screen_text: Array.isArray(parsed.on_screen_text)
      ? parsed.on_screen_text.map(String)
      : [],
    filming_notes: String(parsed.filming_notes || ''),
    persona: persona.name,
    sales_approach: approach.name,
    estimated_length: String(parsed.estimated_length || '30-60 seconds'),
  };
}
