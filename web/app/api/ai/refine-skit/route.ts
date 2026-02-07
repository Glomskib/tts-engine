import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  postProcessSkit,
  validateSkitStructure,
  type Skit,
} from "@/lib/ai/skitPostProcess";
import { requireCredits, useCredit } from "@/lib/credits";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// --- Input Validation Schema ---

const SkitBeatSchema = z.object({
  t: z.string(),
  action: z.string(),
  dialogue: z.string().optional(),
  on_screen_text: z.string().optional(),
});

const CurrentSkitSchema = z.object({
  hook_line: z.string(),
  beats: z.array(SkitBeatSchema),
  b_roll: z.array(z.string()),
  overlays: z.array(z.string()),
  cta_line: z.string(),
  cta_overlay: z.string(),
});

const RefineSkitInputSchema = z.object({
  current_skit: CurrentSkitSchema,
  instruction: z.string().min(1).max(500),
  product_name: z.string().max(100),
  product_brand: z.string().max(100).optional(),
  risk_tier: z.enum(["SAFE", "BALANCED", "SPICY"]).optional(),
}).strict();

type RefineSkitInput = z.infer<typeof RefineSkitInputSchema>;

// --- Compliance Reminder (Same as generate-skit) ---

const COMPLIANCE_REMINDER = `
CRITICAL COMPLIANCE RULES - NEVER VIOLATE:
1. NEVER use words: cure, treat, heal, diagnose, disease, prescription, clinically
2. NEVER use: guaranteed, guarantee, 100%, always, never (as absolutes)
3. NEVER reference: ADHD, depression, anxiety, pain relief, or any medical conditions
4. NEVER make health claims or promise specific results
5. NEVER "in the style of [real person]" - only use fictional personas
6. Product benefits should be stated as experiences, not medical outcomes
`;

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
  let input: RefineSkitInput;
  try {
    const body = await request.json();
    input = RefineSkitInputSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  try {
    // Build the refinement prompt
    const currentSkitJson = JSON.stringify(input.current_skit, null, 2);

    const prompt = `You are refining an existing TikTok product skit. The user wants specific changes made.

CURRENT SKIT:
\`\`\`json
${currentSkitJson}
\`\`\`

PRODUCT INFO:
- Product Name: ${input.product_name}
- Brand: ${input.product_brand || "N/A"}

USER'S REFINEMENT REQUEST:
"${input.instruction}"

${COMPLIANCE_REMINDER}

INSTRUCTIONS:
1. Make ONLY the changes requested by the user
2. Keep the overall structure intact unless asked to change it
3. Maintain the same JSON format
4. Ensure all compliance rules are still followed
5. If the request would violate compliance rules, make a safe alternative that captures the spirit of the request

OUTPUT FORMAT (JSON only, no markdown):
{
  "hook_line": "Opening line that grabs attention (max 150 chars)",
  "beats": [
    {
      "t": "0:00-0:03",
      "action": "What happens visually",
      "dialogue": "What is said (optional)",
      "on_screen_text": "Text overlay (optional, max 50 chars)"
    }
  ],
  "b_roll": ["Suggested B-roll shot 1", "Shot 2"],
  "overlays": ["Text overlay suggestion 1", "Text overlay 2"],
  "cta_line": "Call to action spoken line",
  "cta_overlay": "CTA text overlay (max 40 chars)"
}

Generate the refined skit now. Output ONLY valid JSON, no explanation.`;

    // Call Anthropic API
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
        max_tokens: 2000,
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
      return createApiErrorResponse("AI_ERROR", "Failed to refine skit", 500, correlationId);
    }

    // Parse JSON from response
    let refinedSkit: Skit;
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      const parsed = JSON.parse(jsonStr.trim());

      if (!validateSkitStructure(parsed)) {
        console.error(`[${correlationId}] Invalid skit structure from AI`);
        return createApiErrorResponse("AI_ERROR", "Invalid skit structure", 500, correlationId);
      }

      refinedSkit = parsed as Skit;
    } catch (parseErr) {
      console.error(`[${correlationId}] Failed to parse skit JSON:`, parseErr);
      return createApiErrorResponse("AI_ERROR", "Failed to parse refined skit", 500, correlationId);
    }

    // Post-process with safety checks
    const riskTier = input.risk_tier || "BALANCED";
    const processed = postProcessSkit(refinedSkit, riskTier);

    // Deduct credit after successful generation (admins bypass)
    let creditsRemaining: number | undefined;
    if (!authContext.isAdmin) {
      const deductResult = await useCredit(authContext.user.id, false, 1, "Skit refinement");
      creditsRemaining = deductResult.remaining;
    }

    // Return the refined skit with all expected fields
    return NextResponse.json({
      ok: true,
      data: {
        skit: processed.skit,
        risk_tier_applied: riskTier,
        risk_score: processed.riskScore ?? 0,
        risk_flags: processed.riskFlags ?? [],
        intensity_applied: 50, // Default for refinements
        refinement_applied: input.instruction,
      },
      ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Skit refinement error:`, error);
    return createApiErrorResponse(
      "AI_ERROR",
      error instanceof Error ? error.message : "Skit refinement failed",
      500,
      correlationId
    );
  }
}
