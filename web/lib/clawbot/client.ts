// Clawbot client — Anthropic API calls and database operations

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildStrategyPrompt } from "./prompt";
import type {
  StrategyRequest,
  StrategyResponse,
  FeedbackInput,
  FeedbackSummary,
  WinnerPattern,
} from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

/**
 * Generate a strategy recommendation via the Anthropic API.
 * Returns null on failure (caller should fall back gracefully).
 */
export async function generateStrategy(
  request: StrategyRequest,
  correlationId: string
): Promise<StrategyResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[${correlationId}] ANTHROPIC_API_KEY not set — skipping Clawbot strategy`);
    return null;
  }

  const prompt = buildStrategyPrompt(request);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error(`[${correlationId}] Clawbot strategy fetch failed:`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${correlationId}] Clawbot API error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    console.error(`[${correlationId}] Clawbot returned no content`);
    return null;
  }

  try {
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());

    // Validate required fields
    if (
      !parsed.recommended_angle ||
      !parsed.tone_direction ||
      typeof parsed.risk_score !== "number" ||
      !parsed.reasoning
    ) {
      console.error(`[${correlationId}] Clawbot response missing required fields`);
      return null;
    }

    return {
      recommended_angle: String(parsed.recommended_angle),
      tone_direction: String(parsed.tone_direction),
      risk_score: Math.max(1, Math.min(10, Number(parsed.risk_score))),
      reasoning: String(parsed.reasoning),
      suggested_hooks: Array.isArray(parsed.suggested_hooks)
        ? parsed.suggested_hooks.map(String).slice(0, 5)
        : [],
      content_approach: String(parsed.content_approach ?? ""),
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid.map(String).slice(0, 5) : [],
    };
  } catch (parseErr) {
    console.error(`[${correlationId}] Failed to parse Clawbot response:`, parseErr);
    return null;
  }
}

/**
 * Fetch winner patterns from winners_bank for a user, optionally filtered by product category.
 */
export async function fetchWinnerPatternsForStrategy(
  userId: string,
  productCategory?: string
): Promise<WinnerPattern[]> {
  let query = supabaseAdmin
    .from("winners_bank")
    .select("hook_text, hook_type, content_format, performance_score, engagement_rate, views, product_category")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("performance_score", { ascending: false })
    .limit(10);

  if (productCategory) {
    query = query.eq("product_category", productCategory);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching winner patterns for Clawbot:", error.message);
    return [];
  }

  return (data ?? []) as WinnerPattern[];
}

/**
 * Fetch recent feedback for a user's skits to inform strategy.
 */
export async function fetchRecentFeedback(
  userId: string,
  limit = 5
): Promise<FeedbackSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("clawbot_feedback")
    .select("strategy_used, feedback_type, performance_outcome")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching Clawbot feedback:", error.message);
    return [];
  }

  return (data ?? []) as FeedbackSummary[];
}

/**
 * Record feedback for a skit's strategy.
 */
export async function recordFeedback(
  input: FeedbackInput,
  strategyUsed: Record<string, unknown>,
  userId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("clawbot_feedback")
    .insert({
      skit_id: input.skit_id,
      video_id: input.video_id ?? null,
      strategy_used: strategyUsed,
      feedback_type: input.feedback_type,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error recording Clawbot feedback:", error.message);
    return null;
  }

  return data;
}
