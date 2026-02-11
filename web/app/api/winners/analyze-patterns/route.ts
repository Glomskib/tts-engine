import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * Analysis result shape returned by Claude
 */
interface PatternAnalysis {
  top_hook_types: Array<{
    type: string;
    count: number;
    avg_views: number;
    example: string;
  }>;
  top_formats: Array<{
    format: string;
    count: number;
    avg_engagement: number;
  }>;
  optimal_lengths: Array<{
    range: string;
    count: number;
    avg_views: number;
  }>;
  common_phrases: Array<{
    phrase: string;
    count: number;
    context: string;
  }>;
  top_categories: Array<{
    category: string;
    win_rate: number;
    count: number;
  }>;
  winning_formula: string;
  recommendations: string[];
}

/**
 * POST /api/winners/analyze-patterns
 * Analyze winner patterns using Claude API
 */
export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  // 1. Auth check
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  const userId = authContext.user.id;

  try {
    // 2. Fetch all winners from winners_bank
    //    Production DB uses TypeScript field names: hook, video_url, view_count, notes, patterns
    const { data: winners, error: winnersError } = await supabaseAdmin
      .from("winners_bank")
      .select(
        "id, hook, video_url, view_count, notes, patterns, content_format, hook_type, product_category, engagement_rate, like_count, comment_count, share_count, performance_score, posted_at, created_at"
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .or("performance_score.gt.0,view_count.gt.0");

    if (winnersError) {
      console.error(
        `[${correlationId}] Failed to fetch winners:`,
        winnersError
      );
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to fetch winners from bank",
        500,
        correlationId
      );
    }

    // 3. Fetch top-performing videos from videos table
    const { data: topVideos, error: videosError } = await supabaseAdmin
      .from("videos")
      .select(
        "id, title, tiktok_url, tiktok_views, tiktok_likes, tiktok_comments, tiktok_shares, is_winner, recording_status, content_type, product_id, created_at"
      )
      .or("tiktok_views.gt.5000,is_winner.eq.true")
      .order("tiktok_views", { ascending: false })
      .limit(50);

    if (videosError) {
      console.error(
        `[${correlationId}] Failed to fetch top videos:`,
        videosError
      );
      // Non-fatal: continue with winners data only
    }

    // Must have at least some data to analyze
    const winnerCount = winners?.length || 0;
    const videoCount = topVideos?.length || 0;

    if (winnerCount === 0 && videoCount === 0) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "No winners or top-performing videos found to analyze. Add winners to your bank first.",
        400,
        correlationId
      );
    }

    // 4. Build prompt for Claude
    const systemPrompt = `You are a TikTok content strategist. Analyze winning video patterns from the data provided and identify what makes content succeed. Focus on actionable, specific patterns rather than generic advice. Return your analysis as valid JSON only, with no markdown formatting or code blocks.`;

    const winnersData = (winners || []).map((w) => ({
      hook: w.hook || null,
      view_count: w.view_count || 0,
      engagement_rate: w.engagement_rate || 0,
      content_format: w.content_format || null,
      hook_type: w.hook_type || null,
      category: w.product_category || null,
      like_count: w.like_count || 0,
      comment_count: w.comment_count || 0,
      share_count: w.share_count || 0,
      performance_score: w.performance_score || 0,
      notes: w.notes || null,
      patterns: w.patterns || null,
    }));

    const videosData = (topVideos || []).map((v) => ({
      title: v.title || null,
      views: v.tiktok_views || 0,
      likes: v.tiktok_likes || 0,
      comments: v.tiktok_comments || 0,
      shares: v.tiktok_shares || 0,
      is_winner: v.is_winner || false,
      content_type: v.content_type || null,
    }));

    const userPrompt = `Analyze these ${winnerCount} winners and ${videoCount} top-performing TikTok videos. Identify the patterns that make content succeed.

WINNERS BANK DATA:
${JSON.stringify(winnersData, null, 2)}

TOP-PERFORMING VIDEOS:
${JSON.stringify(videosData, null, 2)}

Return a JSON object with exactly this structure:
{
  "top_hook_types": [{"type": "string", "count": number, "avg_views": number, "example": "string"}],
  "top_formats": [{"format": "string", "count": number, "avg_engagement": number}],
  "optimal_lengths": [{"range": "string (e.g. '15-30s')", "count": number, "avg_views": number}],
  "common_phrases": [{"phrase": "string", "count": number, "context": "string explaining usage"}],
  "top_categories": [{"category": "string", "win_rate": number, "count": number}],
  "winning_formula": "A single sentence capturing the winning formula",
  "recommendations": ["3-5 specific, actionable tips based on the data"]
}

Rules:
- Base all analysis on the actual data provided, not assumptions
- If a field lacks data, still include the key with a reasonable placeholder
- Include at least 3 items in each array where possible
- Percentages should be 0-100 range
- Return ONLY the JSON object, no other text`;

    // 5. Call Anthropic API directly
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return createApiErrorResponse(
        "CONFIG_ERROR",
        "Anthropic API key not configured",
        500,
        correlationId
      );
    }

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(
        `[${correlationId}] Anthropic API error (${aiResponse.status}):`,
        errorText
      );
      return createApiErrorResponse(
        "AI_ERROR",
        "Failed to get analysis from Claude",
        500,
        correlationId
      );
    }

    const aiResult = await aiResponse.json();

    // 6. Parse Claude's response as JSON
    const textContent = aiResult.content?.find(
      (block: { type: string }) => block.type === "text"
    );
    if (!textContent?.text) {
      console.error(
        `[${correlationId}] No text content in Claude response:`,
        JSON.stringify(aiResult)
      );
      return createApiErrorResponse(
        "AI_ERROR",
        "Empty response from Claude",
        500,
        correlationId
      );
    }

    let analysis: PatternAnalysis;
    try {
      // Strip any markdown code fences if present
      let rawText = textContent.text.trim();
      if (rawText.startsWith("```")) {
        rawText = rawText
          .replace(/^```(?:json)?\s*\n?/, "")
          .replace(/\n?```\s*$/, "");
      }
      analysis = JSON.parse(rawText);
    } catch (parseError) {
      console.error(
        `[${correlationId}] Failed to parse Claude response as JSON:`,
        parseError,
        textContent.text.substring(0, 500)
      );
      return createApiErrorResponse(
        "AI_PARSE",
        "Failed to parse analysis response",
        500,
        correlationId
      );
    }

    // 7. Save to winner_pattern_analyses table
    const { data: saved, error: saveError } = await supabaseAdmin
      .from("winner_pattern_analyses")
      .insert({
        user_id: userId,
        analysis: analysis,
        winner_count: winnerCount + videoCount,
        top_hook_types: analysis.top_hook_types || [],
        top_formats: analysis.top_formats || [],
        top_categories: analysis.top_categories || [],
        winning_formula: analysis.winning_formula || null,
        analyzed_at: new Date().toISOString(),
      })
      .select("id, analyzed_at")
      .single();

    if (saveError) {
      console.error(
        `[${correlationId}] Failed to save analysis:`,
        saveError
      );
      // Still return the analysis even if save fails
    }

    // 8. Return the analysis shaped to match frontend expectations
    const analyzedAt = saved?.analyzed_at || new Date().toISOString();
    const responseData = {
      id: saved?.id || null,
      winning_formula: analysis.winning_formula || "",
      top_hook_types: analysis.top_hook_types || [],
      best_formats: (analysis.top_formats || []).map((f) => ({
        format: f.format,
        count: f.count,
        win_rate: Math.round(f.avg_engagement || 0),
      })),
      common_phrases: (analysis.common_phrases || []).map((p) =>
        typeof p === "string" ? p : p.phrase
      ),
      top_categories: (analysis.top_categories || []).map((c) => ({
        category: c.category,
        wins: c.count,
        total: c.count > 0 ? Math.round(c.count / ((c.win_rate || 1) / 100)) : 0,
        win_rate: c.win_rate,
      })),
      recommendations: analysis.recommendations || [],
      analyzed_at: analyzedAt,
      winners_analyzed: winnerCount + videoCount,
    };

    const response = NextResponse.json({
      ok: true,
      data: responseData,
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    console.error(
      `[${correlationId}] Unexpected error in analyze-patterns:`,
      error
    );
    return createApiErrorResponse(
      "INTERNAL",
      "An unexpected error occurred during pattern analysis",
      500,
      correlationId
    );
  }
}

/**
 * GET /api/winners/analyze-patterns
 * Return the latest pattern analysis for the authenticated user
 */
export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId
    );
  }

  const { data: latest, error } = await supabaseAdmin
    .from("winner_pattern_analyses")
    .select("*")
    .eq("user_id", authContext.user.id)
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !latest) {
    // No analysis found is not an error, just return empty
    if (error?.code === "PGRST116") {
      const response = NextResponse.json({
        ok: true,
        data: null,
        correlation_id: correlationId,
      });
      response.headers.set("x-correlation-id", correlationId);
      return response;
    }

    console.error(
      `[${correlationId}] Failed to fetch latest analysis:`,
      error
    );
    return createApiErrorResponse(
      "DB_ERROR",
      "Failed to fetch pattern analysis",
      500,
      correlationId
    );
  }

  // Shape data to match frontend PatternAnalysis interface
  const savedAnalysis = latest.analysis || {};
  const responseData = {
    id: latest.id,
    winning_formula: latest.winning_formula || savedAnalysis.winning_formula || "",
    top_hook_types: latest.top_hook_types || savedAnalysis.top_hook_types || [],
    best_formats: ((latest.top_formats || savedAnalysis.top_formats || []) as Array<{ format: string; count: number; avg_engagement?: number; win_rate?: number }>).map((f) => ({
      format: f.format,
      count: f.count,
      win_rate: Math.round(f.win_rate ?? f.avg_engagement ?? 0),
    })),
    common_phrases: ((savedAnalysis.common_phrases || []) as Array<string | { phrase: string }>).map((p: string | { phrase: string }) =>
      typeof p === "string" ? p : p.phrase
    ),
    top_categories: ((latest.top_categories || savedAnalysis.top_categories || []) as Array<{ category: string; count: number; win_rate: number; wins?: number; total?: number }>).map((c) => ({
      category: c.category,
      wins: c.wins ?? c.count,
      total: c.total ?? (c.count > 0 ? Math.round(c.count / ((c.win_rate || 1) / 100)) : 0),
      win_rate: c.win_rate,
    })),
    recommendations: savedAnalysis.recommendations || [],
    analyzed_at: latest.analyzed_at,
    winners_analyzed: latest.winner_count || 0,
  };

  const response = NextResponse.json({
    ok: true,
    data: responseData,
    correlation_id: correlationId,
  });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}
