import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { requireCredits, useCredit } from "@/lib/credits";
import { z } from "zod";

export const runtime = "nodejs";

const ExtractReviewsSchema = z.object({
  text: z.string().min(50, "Please paste at least 50 characters of review content").max(30000),
  source_url: z.string().url().optional(),
  source_type: z.enum(["amazon", "tiktok", "generic"]).optional().default("generic"),
});

interface ExtractedPainPoint {
  pain_point: string;
  how_they_describe_it: string[];
  emotional_state: string;
  intensity: "low" | "medium" | "high";
  frequency: number;
}

interface ExtractionResult {
  pain_points: ExtractedPainPoint[];
  language_patterns: {
    complaints: string[];
    desires: string[];
    phrases: string[];
  };
  objections: string[];
  review_count_detected: number;
}

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext();
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

  const parseResult = ExtractReviewsSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const { text, source_url, source_type } = parseResult.data;

  try {
    const prompt = `Analyze these customer reviews/comments and extract audience intelligence insights.

SOURCE TYPE: ${source_type}
${source_url ? `SOURCE URL: ${source_url}` : ""}

REVIEWS/COMMENTS TO ANALYZE:
"""
${text}
"""

Extract and structure the following:

1. PAIN POINTS: What problems, frustrations, or needs do customers mention?
   For each pain point:
   - The pain point (concise phrase, 5-10 words max)
   - How they describe it (exact quotes from the reviews, 2-4 examples)
   - Emotional state (frustrated, desperate, hopeful, disappointed, relieved, etc.)
   - Intensity (low/medium/high based on how strongly they express it)
   - Frequency (roughly how many reviews mention this, even if 1)

2. LANGUAGE PATTERNS: Exact phrases customers use
   - complaints: phrases describing problems
   - desires: phrases describing what they want/wish
   - phrases: notable expressions, slang, or memorable quotes

3. OBJECTIONS: Hesitations, concerns, or doubts mentioned (price, trust, effectiveness, etc.)

4. Count approximately how many individual reviews you detected in the text.

Return as JSON:
{
  "pain_points": [
    {
      "pain_point": "Can't sleep through the night",
      "how_they_describe_it": ["I toss and turn for hours", "3am and I'm still awake"],
      "emotional_state": "frustrated",
      "intensity": "high",
      "frequency": 5
    }
  ],
  "language_patterns": {
    "complaints": ["waste of money", "didn't work for me"],
    "desires": ["just want to feel normal", "finally sleep through the night"],
    "phrases": ["game changer", "tried everything"]
  },
  "objections": ["too expensive", "worried about side effects", "skeptical it will work"],
  "review_count_detected": 15
}

Focus on extracting AUTHENTIC customer language - the exact words real people use, not marketing speak.
Return ONLY valid JSON, no markdown or explanation.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
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
    let extraction: ExtractionResult;
    try {
      let jsonText = textContent.text.trim();
      if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
      if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
      if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
      extraction = JSON.parse(jsonText.trim());
    } catch {
      console.error(`[${correlationId}] Failed to parse AI response:`, textContent.text.slice(0, 500));
      return NextResponse.json({
        ok: false,
        error: "Failed to parse AI response",
        correlation_id: correlationId,
      }, { status: 500 });
    }

    // Deduct credit after successful extraction (admins bypass)
    let creditsRemaining: number | undefined;
    if (!authContext.isAdmin) {
      const deductResult = await useCredit(authContext.user.id, false, 1, "Review extraction");
      creditsRemaining = deductResult.remaining;
    }

    return NextResponse.json({
      ok: true,
      data: {
        extraction,
        source_url,
        source_type,
        usage: {
          input_tokens: data.usage?.input_tokens,
          output_tokens: data.usage?.output_tokens,
        },
      },
      ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Extract reviews error:`, error);
    return createApiErrorResponse("INTERNAL", "Extraction failed", 500, correlationId);
  }
}
