/**
 * Winners Bank Intelligence
 *
 * AI analysis and pattern extraction for winners
 */

import type { Winner, WinnerAIAnalysis } from './types';

/**
 * Build the prompt for AI analysis of a winner
 */
export function buildAnalysisPrompt(winner: Winner): string {
  return `Analyze this TikTok video that performed well and explain WHY it worked.

VIDEO DETAILS:
- Title/Description: ${winner.video_title || 'N/A'}
- Hook: "${winner.hook_text || 'Not provided'}"
- Hook Type: ${winner.hook_type || 'Unknown'}
- Content Format: ${winner.content_format || 'Unknown'}
- Video Length: ${winner.video_length_seconds || 'Unknown'} seconds
- Product: ${winner.product_name || 'N/A'} (${winner.product_category || 'N/A'})
${winner.source_type === 'external' ? `- Creator: @${winner.creator_handle || 'Unknown'} (${winner.creator_niche || 'N/A'})` : ''}

PERFORMANCE METRICS:
- Views: ${winner.views?.toLocaleString() || 'N/A'}
- Likes: ${winner.likes?.toLocaleString() || 'N/A'}
- Comments: ${winner.comments?.toLocaleString() || 'N/A'}
- Shares: ${winner.shares?.toLocaleString() || 'N/A'}
- Saves: ${winner.saves?.toLocaleString() || 'N/A'}
- Engagement Rate: ${winner.engagement_rate?.toFixed(2) || 'N/A'}%

RETENTION DATA:
- Avg Watch Time: ${winner.avg_watch_time_percent || 'N/A'}%
- Watched past 3s: ${winner.retention_3s || 'N/A'}%
- Watched to half: ${winner.retention_half || 'N/A'}%
- Watched to end: ${winner.retention_full || 'N/A'}%

USER NOTES: ${winner.user_notes || 'None provided'}

Analyze this and return JSON with this EXACT structure:
{
  "summary": "One paragraph explaining the overall success factors",

  "hook_analysis": {
    "effectiveness_score": 8,
    "what_worked": "Specific analysis of why the hook grabbed attention",
    "pattern": "The underlying pattern (e.g., 'curiosity gap', 'pattern interrupt', 'relatable scenario')",
    "reusable_structure": "A template version: 'I [unexpected action] and [result]...'"
  },

  "content_structure": {
    "pacing": "Fast/Medium/Slow and why it worked",
    "story_arc": "How the content flowed (setup -> conflict -> resolution)",
    "product_integration": "How naturally the product was woven in",
    "cta_effectiveness": "How the call-to-action was handled"
  },

  "audience_psychology": {
    "emotions_triggered": ["curiosity", "fomo", "relatability"],
    "why_people_shared": "The sharing motivation",
    "comment_drivers": "What made people want to comment"
  },

  "patterns": {
    "hook_pattern": "The reusable hook formula",
    "content_pattern": "The reusable content structure",
    "cta_pattern": "The reusable CTA approach"
  },

  "recommendations": [
    "Specific recommendation 1 for recreating this success",
    "Specific recommendation 2",
    "Specific recommendation 3"
  ],

  "avoid": [
    "What NOT to copy (if anything seemed lucky/unrepeatable)"
  ]
}

Be specific and actionable. Focus on PATTERNS that can be replicated, not just praise.`;
}

/**
 * Call AI to analyze a winner
 */
export async function analyzeWinnerWithAI(winner: Winner): Promise<WinnerAIAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return null;
  }

  const prompt = buildAnalysisPrompt(winner);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('AI analysis request failed:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as WinnerAIAnalysis;
    }

    console.error('No JSON found in AI response');
    return null;
  } catch (err) {
    console.error('AI analysis error:', err);
    return null;
  }
}

/**
 * Extract patterns from AI analysis for quick reference
 */
export function extractPatternsFromAnalysis(analysis: WinnerAIAnalysis) {
  return {
    hook_pattern: analysis.patterns?.hook_pattern || analysis.hook_analysis?.pattern,
    content_pattern: analysis.patterns?.content_pattern,
    cta_pattern: analysis.patterns?.cta_pattern,
  };
}
