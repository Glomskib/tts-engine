// Clawbot prompt builder — constructs the strategy system prompt

import type { StrategyRequest, WinnerPattern, FeedbackSummary } from "./types";

function formatWinnerPatterns(patterns: WinnerPattern[]): string {
  if (!patterns.length) return "No winner data available yet.";

  return patterns
    .slice(0, 10) // Limit to top 10
    .map((w, i) => {
      const parts = [`${i + 1}.`];
      if (w.hook_text) parts.push(`Hook: "${w.hook_text}"`);
      if (w.hook_type) parts.push(`Type: ${w.hook_type}`);
      if (w.content_format) parts.push(`Format: ${w.content_format}`);
      if (w.performance_score) parts.push(`Score: ${w.performance_score}/10`);
      if (w.engagement_rate) parts.push(`Engagement: ${w.engagement_rate}%`);
      if (w.views) parts.push(`Views: ${w.views.toLocaleString()}`);
      return parts.join(" | ");
    })
    .join("\n");
}

function formatFeedbackHistory(feedback: FeedbackSummary[]): string {
  if (!feedback.length) return "No feedback history yet.";

  return feedback
    .slice(0, 5) // Last 5 feedback entries
    .map((f, i) => {
      const parts = [`${i + 1}. ${f.feedback_type.toUpperCase()}`];
      parts.push(`Angle: ${f.strategy_used.recommended_angle}`);
      parts.push(`Tone: ${f.strategy_used.tone_direction}`);
      if (f.performance_outcome?.engagement_rate) {
        parts.push(`Engagement: ${f.performance_outcome.engagement_rate}%`);
      }
      return parts.join(" | ");
    })
    .join("\n");
}

export function buildStrategyPrompt(request: StrategyRequest): string {
  const winnerSection = formatWinnerPatterns(request.winner_patterns ?? []);
  const feedbackSection = formatFeedbackHistory(request.recent_feedback ?? []);

  return `You are Clawbot, a TikTok content strategy AI for FlashFlow. Your job is to analyze context and recommend the best creative strategy for a skit about a product.

PRODUCT CONTEXT:
- Product: ${request.product_name}
${request.brand_name ? `- Brand: ${request.brand_name}` : ""}
${request.product_category ? `- Category: ${request.product_category}` : ""}
${request.product_context ? `- Details: ${request.product_context}` : ""}
${request.content_format ? `- Requested Format: ${request.content_format}` : ""}
${request.risk_tier ? `- Risk Tolerance: ${request.risk_tier}` : ""}
${request.target_audience ? `- Target Audience: ${request.target_audience}` : ""}

WINNING PATTERNS (from this user's top-performing content):
${winnerSection}

RECENT STRATEGY FEEDBACK (learn from what worked/didn't):
${feedbackSection}

Based on this context, provide a creative strategy recommendation. Return ONLY valid JSON matching this exact structure:

{
  "recommended_angle": "A specific creative angle (e.g., 'frustrated customer discovers product by accident')",
  "tone_direction": "The emotional tone (e.g., 'deadpan humor with genuine surprise')",
  "risk_score": 5,
  "reasoning": "Why this strategy should work based on the patterns and context",
  "suggested_hooks": ["Hook option 1", "Hook option 2", "Hook option 3"],
  "content_approach": "Brief description of how to structure the skit",
  "avoid": ["Things to avoid based on underperforming patterns"]
}

RULES:
- risk_score must be 1-10 (1=very safe, 10=very edgy)
- suggested_hooks should be 2-4 options, each under 15 words
- Learn from positive feedback: repeat what works
- Learn from negative feedback: avoid what didn't work
- Be specific, not generic — reference the actual product and patterns
- If risk_tier is SAFE, keep risk_score under 4
- If risk_tier is SPICY, push risk_score to 6+`;
}
