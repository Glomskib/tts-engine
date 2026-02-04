import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { requireCredits, useCredit } from "@/lib/credits";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// --- Validation ---

const AnalyzeWinnerSchema = z.object({
  transcript: z.string().min(10, "Transcript must be at least 10 characters").max(50000),
  metrics: z.object({
    views: z.number().int().min(0).optional(),
    likes: z.number().int().min(0).optional(),
    comments: z.number().int().min(0).optional(),
    shares: z.number().int().min(0).optional(),
  }).optional(),
  creator_handle: z.string().optional(),
  video_url: z.string().url().optional(),
});

// --- POST: Analyze winning video transcript ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const debugMode = process.env.DEBUG_AI === "true";

  // Auth check
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

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[${correlationId}] ANTHROPIC_API_KEY not configured`);
    return NextResponse.json({
      ok: false,
      error: "AI service not configured. Please add ANTHROPIC_API_KEY to environment variables.",
      correlation_id: correlationId,
    }, { status: 500 });
  }

  // Parse and validate input
  let input: z.infer<typeof AnalyzeWinnerSchema>;
  try {
    const body = await request.json();

    if (debugMode) {
      console.log(`[${correlationId}] Received analyze request:`, {
        transcriptLength: body.transcript?.length,
        hasMetrics: !!body.metrics,
      });
    }

    input = AnalyzeWinnerSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      return NextResponse.json({
        ok: false,
        error: `Validation error: ${issues}`,
        correlation_id: correlationId,
      }, { status: 400 });
    }
    return NextResponse.json({
      ok: false,
      error: "Invalid JSON body",
      correlation_id: correlationId,
    }, { status: 400 });
  }

  try {
    const metricsContext = input.metrics
      ? `\nPerformance Metrics:\n- Views: ${input.metrics.views?.toLocaleString() || 'Unknown'}\n- Likes: ${input.metrics.likes?.toLocaleString() || 'Unknown'}\n- Comments: ${input.metrics.comments?.toLocaleString() || 'Unknown'}\n- Shares: ${input.metrics.shares?.toLocaleString() || 'Unknown'}`
      : '';

    const prompt = `Analyze this winning TikTok video transcript and extract key patterns that made it successful.
${metricsContext}
${input.creator_handle ? `Creator: @${input.creator_handle}` : ''}

TRANSCRIPT:
"""
${input.transcript}
"""

Analyze and extract the following in JSON format:

{
  "hook_line": "The exact first 1-2 sentences that grab attention",
  "hook_style": "One of: question, shock, relatable, controversial, promise, mystery, challenge, confession",
  "content_format": "One of: skit, pov, reaction, storytime, tutorial, duet, trend, review, unboxing",
  "comedy_style": "One of: deadpan, absurd, wholesome, chaotic, sarcastic, physical, observational, self-deprecating, none",
  "pacing": "One of: fast_cuts, slow_build, steady, escalating, back_and_forth",
  "key_phrases": ["Array of 3-5 memorable phrases or lines that resonate"],
  "what_works": ["Array of 2-3 bullet points explaining why this video is effective"],
  "product_integration": "How the product is integrated: natural, forced, subtle, central, none",
  "target_emotion": "Primary emotion targeted: humor, curiosity, fomo, relatability, shock, satisfaction",
  "replicable_elements": ["Array of 2-3 specific techniques that could be replicated"],
  "estimated_production": "One of: low, medium, high - production value needed"
}

Return ONLY valid JSON, no markdown or explanation.`;

    if (debugMode) {
      console.log(`[${correlationId}] Sending request to Anthropic API...`);
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
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${correlationId}] Anthropic API error: ${response.status} - ${errorText}`);

      // Parse error for better message
      let errorMessage = `AI API error (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // Use raw text if not JSON
        if (errorText.length < 200) {
          errorMessage = errorText;
        }
      }

      return NextResponse.json({
        ok: false,
        error: errorMessage,
        correlation_id: correlationId,
      }, { status: 500 });
    }

    const data = await response.json();

    if (debugMode) {
      console.log(`[${correlationId}] Anthropic response received:`, {
        hasContent: !!data.content,
        usage: data.usage,
      });
    }

    // Extract text response
    const textContent = data.content?.find((c: { type: string }) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      console.error(`[${correlationId}] No text content in response:`, data);
      return NextResponse.json({
        ok: false,
        error: "No response from AI - empty content",
        correlation_id: correlationId,
      }, { status: 500 });
    }

    // Parse JSON response
    let analysis: Record<string, unknown>;
    try {
      // Clean potential markdown formatting
      let jsonText = textContent.text.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.slice(7);
      }
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.slice(3);
      }
      if (jsonText.endsWith("```")) {
        jsonText = jsonText.slice(0, -3);
      }
      analysis = JSON.parse(jsonText.trim());
    } catch {
      console.error(`[${correlationId}] Failed to parse AI response:`, textContent.text.slice(0, 500));
      return NextResponse.json({
        ok: false,
        error: "Failed to parse AI response as JSON. The AI may have returned invalid formatting.",
        raw_response: debugMode ? textContent.text.slice(0, 500) : undefined,
        correlation_id: correlationId,
      }, { status: 500 });
    }

    // Deduct credits after successful analysis (admins bypass)
    let creditsRemaining: number | undefined;
    if (!authContext.isAdmin) {
      const deductResult = await useCredit(authContext.user.id, false, 2, "Winner analysis");
      creditsRemaining = deductResult.remaining;
    }

    const apiResponse = NextResponse.json({
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
    apiResponse.headers.set("x-correlation-id", correlationId);
    return apiResponse;

  } catch (error) {
    console.error(`[${correlationId}] Analyze winner error:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json({
      ok: false,
      error: errorMessage,
      correlation_id: correlationId,
    }, { status: 500 });
  }
}
