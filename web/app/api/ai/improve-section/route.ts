import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";
import { requireCredits, useCredit } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

// --- Input Validation Schema ---

const SectionTypeSchema = z.enum([
  "hook",
  "beat",
  "cta",
  "cta_overlay",
  "broll",
  "overlay",
]);

const ContextSchema = z.object({
  product_name: z.string(),
  product_brand: z.string().optional(),
  full_skit_summary: z.string().optional(),
  beat_index: z.number().int().min(0).optional(), // For beat improvements
});

const ImproveSectionInputSchema = z.object({
  section_type: SectionTypeSchema,
  current_content: z.string().min(1).max(2000),
  context: ContextSchema,
  instruction: z.string().max(500).optional(),
}).strict();

type ImproveSectionInput = z.infer<typeof ImproveSectionInputSchema>;
type SectionType = z.infer<typeof SectionTypeSchema>;

// --- Section-Specific Prompts ---

function buildImprovementPrompt(input: ImproveSectionInput): string {
  const { section_type, current_content, context, instruction } = input;
  const productDesc = context.product_brand
    ? `${context.product_brand} ${context.product_name}`
    : context.product_name;

  const customInstruction = instruction
    ? `\n\nUSER'S SPECIFIC REQUEST: "${instruction}"\nFollow this direction while improving the section.`
    : "";

  const skitContext = context.full_skit_summary
    ? `\n\nFULL SKIT CONTEXT:\n${context.full_skit_summary}\n\nMake sure your improvement fits naturally with the rest of the skit.`
    : "";

  let sectionGuidelines = "";

  switch (section_type) {
    case "hook":
      sectionGuidelines = `
IMPROVING: HOOK LINE
The hook is the first thing viewers see/hear. It must stop the scroll in 1-2 seconds.

IMPROVEMENT CRITERIA:
- Create an immediate "wait what?" moment
- Use pattern interrupts, provocative statements, or start mid-action
- Be specific and intriguing, not generic
- Keep it punchy (under 15 words ideal)
- Avoid clichés like "POV:" unless genuinely compelling

EXAMPLES OF STRONG HOOKS:
- "I finally did it..." (mystery)
- "Nobody talks about this..." (forbidden knowledge)
- "This is what happens when..." (consequence setup)
- Starting with the punchline, then explaining`;
      break;

    case "beat":
      sectionGuidelines = `
IMPROVING: SKIT BEAT
Beats are the building blocks of the skit's comedic rhythm.

IMPROVEMENT CRITERIA:
- Each beat should either escalate or provide a contrast
- Actions should be visual and filmable
- Dialogue should sound natural and punchy
- Add specific details ("your aunt who sells MLM products" > "someone annoying")
- Include timing/pacing cues where helpful
- Consider adding on-screen text for extra comedy

BEAT FORMAT: Return JSON with { "t": "0:XX-0:XX", "action": "...", "dialogue": "..." (optional), "on_screen_text": "..." (optional) }`;
      break;

    case "cta":
      sectionGuidelines = `
IMPROVING: CALL TO ACTION LINE
The CTA should feel natural, not preachy. It's the spoken line at the end.

IMPROVEMENT CRITERIA:
- Make it feel like part of the bit, not a sales pitch
- Keep it quick (under 10 words ideal)
- Match the tone of the skit (funny skit = funny CTA)
- Be specific about what to do (link in bio, tap to shop, etc.)

EXAMPLES OF GOOD CTAs:
- "Anyway, link's right there if you want it."
- "I mean... you saw what happened. Link in bio."
- "Don't be like me. Link below."`;
      break;

    case "cta_overlay":
      sectionGuidelines = `
IMPROVING: CTA OVERLAY TEXT
This is the text that appears on screen during the CTA.

IMPROVEMENT CRITERIA:
- Maximum 40 characters (must fit on screen)
- Clear and actionable
- Can be different from spoken CTA
- Use urgency sparingly and authentically

EXAMPLES:
- "Link in bio"
- "Tap to shop"
- "You know what to do"`;
      break;

    case "broll":
      sectionGuidelines = `
IMPROVING: B-ROLL SUGGESTION
B-roll is supporting footage that enhances the skit.

IMPROVEMENT CRITERIA:
- Be specific about what shot to capture
- Include camera angle/movement if relevant
- Should complement, not distract from, the main content
- Think about visual comedy opportunities
- Consider stock footage alternatives`;
      break;

    case "overlay":
      sectionGuidelines = `
IMPROVING: TEXT OVERLAY
Text overlays appear on screen during the skit.

IMPROVEMENT CRITERIA:
- Maximum 50 characters (must be readable)
- Add comedic value or context
- Time-appropriate (match the beat)
- Consider emoji use sparingly
- Can be captions, reactions, or meta-commentary`;
      break;
  }

  const responseFormat = section_type === "beat"
    ? 'Return ONLY valid JSON with { "t": "timestamp", "action": "...", "dialogue": "..." (optional), "on_screen_text": "..." (optional) }'
    : "Return ONLY the improved text, no explanation or quotes around it.";

  return `You are a TikTok comedy writer improving a specific section of a skit for "${productDesc}".

CURRENT ${section_type.toUpperCase()} CONTENT:
"${current_content}"

${sectionGuidelines}
${skitContext}
${customInstruction}

IMPORTANT:
- Keep the same general intent but make it better
- Be specific and punchy
- Match the product and brand voice
- ${responseFormat}

Improve this ${section_type} now:`;
}

// --- Main API Handler ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Rate limiting
  const rateLimitResponse = enforceRateLimits(
    { userId: authContext.user.id, ...extractRateLimitContext(request) },
    correlationId
  );
  if (rateLimitResponse) return rateLimitResponse;

  // Credit check (admins bypass)
  const creditError = await requireCredits(authContext.user.id, authContext.isAdmin);
  if (creditError) {
    return NextResponse.json({
      ok: false,
      error: creditError.error,
      creditsRemaining: creditError.remaining,
      upgrade: true,
      correlation_id: correlationId,
    }, { status: creditError.status });
  }

  // Parse and validate input
  let input: ImproveSectionInput;
  try {
    const body = await request.json();
    input = ImproveSectionInputSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  try {
    const prompt = buildImprovementPrompt(input);
    const improved = await callAnthropicForImprovement(prompt, input.section_type, correlationId);

    if (!improved) {
      return createApiErrorResponse("AI_ERROR", "Failed to improve section", 500, correlationId);
    }

    // Deduct credit after successful improvement (admins bypass)
    let creditsRemaining: number | undefined;
    if (!authContext.isAdmin) {
      const deductResult = await useCredit(authContext.user.id, false, 1, "Section improvement");
      creditsRemaining = deductResult.remaining;
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        section_type: input.section_type,
        original: input.current_content,
        improved,
      },
      ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Section improvement error:`, error);
    return createApiErrorResponse(
      "AI_ERROR",
      error instanceof Error ? error.message : "Section improvement failed",
      500,
      correlationId
    );
  }
}

// --- Anthropic API Call ---

async function callAnthropicForImprovement(
  prompt: string,
  sectionType: SectionType,
  correlationId: string
): Promise<string | object | null> {
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
      max_tokens: 500,
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
  const content = data.content?.[0]?.text?.trim();

  if (!content) {
    console.error(`[${correlationId}] No content from Anthropic`);
    return null;
  }

  // For beat sections, parse JSON
  if (sectionType === "beat") {
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      return JSON.parse(jsonStr.trim());
    } catch {
      // If JSON parsing fails, return as string (might be a simple improvement)
      return content;
    }
  }

  // For other sections, return plain text (remove any quotes if present)
  return content.replace(/^["']|["']$/g, "");
}
