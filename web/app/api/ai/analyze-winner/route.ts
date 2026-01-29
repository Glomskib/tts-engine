import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

// --- Validation ---

const AnalyzeWinnerSchema = z.object({
  transcript: z.string().min(10).max(50000),
  metrics: z.object({
    views: z.number().int().min(0).optional(),
    likes: z.number().int().min(0).optional(),
    comments: z.number().int().min(0).optional(),
    shares: z.number().int().min(0).optional(),
  }).optional(),
  creator_handle: z.string().optional(),
  video_url: z.string().url().optional(),
}).strict();

// --- POST: Analyze winning video transcript ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return createApiErrorResponse("INTERNAL", "AI service not configured", 500, correlationId);
  }

  // Parse and validate input
  let input: z.infer<typeof AnalyzeWinnerSchema>;
  try {
    const body = await request.json();
    input = AnalyzeWinnerSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
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
      return createApiErrorResponse("INTERNAL", "AI service error", 500, correlationId);
    }

    const data = await response.json();

    // Extract text response
    const textContent = data.content?.find((c: { type: string }) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return createApiErrorResponse("INTERNAL", "No response from AI", 500, correlationId);
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
      console.error(`[${correlationId}] Failed to parse AI response:`, textContent.text);
      return createApiErrorResponse("INTERNAL", "Failed to parse AI analysis", 500, correlationId);
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
      correlation_id: correlationId,
    });
    apiResponse.headers.set("x-correlation-id", correlationId);
    return apiResponse;

  } catch (error) {
    console.error(`[${correlationId}] Analyze winner error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Failed to analyze video",
      500,
      correlationId
    );
  }
}
