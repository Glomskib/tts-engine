import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

// --- Input Validation Schema ---

const SkitBeatSchema = z.object({
  t: z.string(),
  action: z.string(),
  dialogue: z.string().optional(),
  on_screen_text: z.string().optional(),
});

const SkitDataSchema = z.object({
  hook_line: z.string(),
  beats: z.array(SkitBeatSchema),
  b_roll: z.array(z.string()),
  overlays: z.array(z.string()),
  cta_line: z.string(),
  cta_overlay: z.string(),
});

const ScoreSkitInputSchema = z.object({
  skit_data: SkitDataSchema,
  product_name: z.string().min(1).max(100),
  product_brand: z.string().max(100).optional(),
}).strict();

type ScoreSkitInput = z.infer<typeof ScoreSkitInputSchema>;

// --- Score Response Type ---

interface AIScoreResponse {
  hook_strength: number;
  humor_level: number;
  product_integration: number;
  virality_potential: number;
  clarity: number;
  production_feasibility: number;
  audience_language: number;
  overall_score: number;
  strengths: string[];
  improvements: string[];
}

// --- Scoring Prompt ---

function buildScoringPrompt(skit: ScoreSkitInput["skit_data"], productName: string, productBrand?: string): string {
  const productDesc = productBrand ? `${productBrand} ${productName}` : productName;

  // Serialize skit for the prompt
  const skitText = `
HOOK: "${skit.hook_line}"

BEATS:
${skit.beats.map((beat, i) => `${i + 1}. [${beat.t}] ${beat.action}${beat.dialogue ? `\n   Dialogue: "${beat.dialogue}"` : ''}${beat.on_screen_text ? `\n   Text: "${beat.on_screen_text}"` : ''}`).join('\n\n')}

CTA: "${skit.cta_line}"
CTA Overlay: "${skit.cta_overlay}"

B-ROLL SUGGESTIONS:
${skit.b_roll.map((b, i) => `${i + 1}. ${b}`).join('\n')}

OVERLAYS:
${skit.overlays.map((o, i) => `${i + 1}. ${o}`).join('\n')}
`.trim();

  return `You are a TikTok content strategist evaluating short-form video scripts. Score this skit for a "${productDesc}" product. Be critical but constructive.

THE SKIT TO EVALUATE:
${skitText}

EVALUATION CRITERIA (score each 1-10):

1. HOOK STRENGTH: How attention-grabbing is the opening? Will it stop the scroll in the first 1-2 seconds?
   - 1-3: Generic, forgettable, wouldn't make someone pause
   - 4-6: Decent but predictable, might get a glance
   - 7-8: Strong pattern interrupt, creates curiosity
   - 9-10: Exceptional, guaranteed scroll-stopper

2. HUMOR LEVEL: How funny/entertaining is the content?
   - 1-3: Flat, cringey, or trying too hard
   - 4-6: Has moments, but not memorable
   - 7-8: Genuinely funny, would share with friends
   - 9-10: Comedy gold, quotable moments

3. PRODUCT INTEGRATION: How naturally is the product woven in? (not salesy)
   - 1-3: Feels like a forced ad, product mention is jarring
   - 4-6: Product is there but feels shoehorned
   - 7-8: Natural integration, product feels like part of the story
   - 9-10: You forget it's an ad, product is the hero organically

4. VIRALITY POTENTIAL: How shareable/relatable is this? Would people tag friends?
   - 1-3: No rewatch value, wouldn't share
   - 4-6: Some people might relate, limited appeal
   - 7-8: Highly relatable, people will tag friends
   - 9-10: "OMG this is literally me" energy, guaranteed shares

5. CLARITY: Is the message clear? Easy to follow?
   - 1-3: Confusing, hard to follow, too many ideas
   - 4-6: Gets the point across but messy
   - 7-8: Clear narrative, easy to follow
   - 9-10: Crystal clear, every beat lands perfectly

6. PRODUCTION FEASIBILITY: How easy is this to actually film?
   - 1-3: Would require major budget, complex setups, CGI
   - 4-6: Needs some planning and resources
   - 7-8: Achievable with basic equipment and planning
   - 9-10: Can shoot this with a phone in an afternoon

7. AUDIENCE LANGUAGE: Does this sound like how the target customer actually talks?
   - 1-3: Corporate-speak, forced humor, unnatural phrasing, no one talks like this
   - 4-6: Somewhat natural but has awkward moments or generic language
   - 7-8: Authentic voice, sounds like a real person, relatable phrasing
   - 9-10: Perfectly captures how the target demographic speaks, slang and all

OVERALL SCORE: Weighted average emphasizing hook (20%), humor (20%), product integration (20%), virality (15%), audience language (15%), clarity (5%), feasibility (5%).

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "hook_strength": <1-10>,
  "humor_level": <1-10>,
  "product_integration": <1-10>,
  "virality_potential": <1-10>,
  "clarity": <1-10>,
  "production_feasibility": <1-10>,
  "audience_language": <1-10>,
  "overall_score": <1-10>,
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "improvements": ["actionable improvement 1", "actionable improvement 2", "actionable improvement 3"]
}

IMPORTANT:
- Be honest and critical. Average skits should score 5-6. Only exceptional work gets 8+.
- Strengths should be SPECIFIC to this skit, not generic praise.
- Improvements should be ACTIONABLE, not vague ("add more humor" is bad, "the beat at 0:15 could escalate faster with a callback to the hook" is good).
- Each array should have 2-3 items, no more.`;
}

// --- Main API Handler ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Rate limiting
  const rateLimitResponse = enforceRateLimits(
    { userId: authContext.user.id, ...extractRateLimitContext(request) },
    correlationId
  );
  if (rateLimitResponse) return rateLimitResponse;

  // Parse and validate input
  let input: ScoreSkitInput;
  try {
    const body = await request.json();
    input = ScoreSkitInputSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  try {
    // Build the scoring prompt
    const prompt = buildScoringPrompt(input.skit_data, input.product_name, input.product_brand);

    // Call Anthropic API
    const scores = await callAnthropicForScoring(prompt, correlationId);

    if (!scores) {
      return createApiErrorResponse("AI_ERROR", "Failed to score skit", 500, correlationId);
    }

    // Validate score structure
    if (!validateScoreStructure(scores)) {
      console.error(`[${correlationId}] Invalid score structure from AI:`, scores);
      return createApiErrorResponse("AI_ERROR", "Invalid score format from AI", 500, correlationId);
    }

    const response = NextResponse.json({
      ok: true,
      data: scores,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Skit scoring error:`, error);
    return createApiErrorResponse(
      "AI_ERROR",
      error instanceof Error ? error.message : "Skit scoring failed",
      500,
      correlationId
    );
  }
}

// --- Anthropic API Call ---

async function callAnthropicForScoring(prompt: string, correlationId: string): Promise<AIScoreResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[${correlationId}] ANTHROPIC_API_KEY not configured`);
    throw new Error("AI service not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${correlationId}] Anthropic API error: ${response.status} - ${errorText}`);
    throw new Error(`AI service error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    console.error(`[${correlationId}] No content from Anthropic`);
    return null;
  }

  // Parse JSON from response
  try {
    let jsonStr = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    return JSON.parse(jsonStr.trim()) as AIScoreResponse;
  } catch (parseErr) {
    console.error(`[${correlationId}] Failed to parse score JSON:`, parseErr);
    console.error(`[${correlationId}] Raw content:`, content);
    return null;
  }
}

// --- Validation ---

function validateScoreStructure(score: unknown): score is AIScoreResponse {
  if (typeof score !== 'object' || score === null) return false;

  const s = score as Record<string, unknown>;

  const numberFields = [
    'hook_strength', 'humor_level', 'product_integration',
    'virality_potential', 'clarity', 'production_feasibility',
    'audience_language', 'overall_score'
  ];

  for (const field of numberFields) {
    if (typeof s[field] !== 'number' || s[field] < 1 || s[field] > 10) {
      return false;
    }
  }

  if (!Array.isArray(s.strengths) || !Array.isArray(s.improvements)) {
    return false;
  }

  if (s.strengths.some((x: unknown) => typeof x !== 'string') ||
      s.improvements.some((x: unknown) => typeof x !== 'string')) {
    return false;
  }

  return true;
}
