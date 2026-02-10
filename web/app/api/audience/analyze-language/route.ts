import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { requireCredits, useCredit } from "@/lib/credits";
import { z } from "zod";

export const runtime = "nodejs";

const AnalyzeLanguageSchema = z.object({
  text: z.string().min(10).max(10000),
  context: z.enum(["review", "comment", "transcript", "social_post"]).optional(),
});

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "AI service not configured",
      correlation_id: correlationId,
    }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const parseResult = AnalyzeLanguageSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const { text, context } = parseResult.data;

  try {
    const prompt = `Analyze this ${context || "text"} to extract audience intelligence insights.

TEXT TO ANALYZE:
"""
${text}
"""

Extract and return as JSON:

{
  "pain_points": [
    {
      "point": "The main pain point expressed",
      "intensity": "low|medium|high|extreme",
      "how_they_describe_it": ["exact phrases used"],
      "emotional_state": "frustrated|desperate|hopeful|etc"
    }
  ],
  "language_patterns": {
    "phrases_used": ["casual phrases they use naturally"],
    "emotional_words": ["words that reveal emotion"],
    "tone": "casual|formal|frustrated|hopeful|skeptical",
    "humor_style": "self-deprecating|sarcastic|none|wholesome"
  },
  "objections_expressed": ["any doubts or objections mentioned"],
  "desires": ["what they want or wish for"],
  "lifestyle_hints": ["clues about their lifestyle"],
  "demographic_hints": {
    "age_range_guess": "20s|30s|40s|etc",
    "life_stage": "new parent|busy professional|retiree|student|etc"
  },
  "content_recommendations": {
    "hook_style": "question|relatable|shock|promise",
    "topics_that_resonate": ["topics they care about"],
    "angles_to_avoid": ["approaches that wouldn't work"]
  }
}

Focus on extracting AUTHENTIC language - the exact words and phrases real people use, not marketing speak.
Return ONLY valid JSON, no markdown.`;

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
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${correlationId}] Anthropic API error:`, errorText);
      return NextResponse.json({
        ok: false,
        error: `AI API error: ${response.status}`,
        correlation_id: correlationId,
      }, { status: 500 });
    }

    const data = await response.json();
    const textContent = data.content?.find((c: { type: string }) => c.type === "text");

    if (!textContent) {
      return NextResponse.json({
        ok: false,
        error: "No response from AI",
        correlation_id: correlationId,
      }, { status: 500 });
    }

    // Parse JSON response
    let analysis: Record<string, unknown>;
    try {
      let jsonText = textContent.text.trim();
      if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
      if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
      if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
      analysis = JSON.parse(jsonText.trim());
    } catch {
      console.error(`[${correlationId}] Failed to parse AI response:`, textContent.text.slice(0, 500));
      return NextResponse.json({
        ok: false,
        error: "Failed to parse AI response",
        correlation_id: correlationId,
      }, { status: 500 });
    }

    // Deduct credit after successful analysis (admins bypass)
    let creditsRemaining: number | undefined;
    if (!authContext.isAdmin) {
      const deductResult = await useCredit(authContext.user.id, false, 1, "Language analysis");
      creditsRemaining = deductResult.remaining;
    }

    return NextResponse.json({
      ok: true,
      data: {
        analysis,
        usage: {
          input_tokens: data.usage?.input_tokens,
          output_tokens: data.usage?.output_tokens,
        },
      },
      ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Analyze language error:`, error);
    return createApiErrorResponse("INTERNAL", "Analysis failed", 500, correlationId);
  }
}
