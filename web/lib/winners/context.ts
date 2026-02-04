/**
 * Winners Bank Context Builder
 *
 * Builds prompt context from winners intelligence for script generation
 */

import type { Winner, WinnersIntelligence } from './types';

/**
 * Build enhanced winners context for script generation prompt
 */
export function buildWinnersContext(intelligence: WinnersIntelligence | null): string {
  if (!intelligence || intelligence.totalCount === 0) return '';

  const { winners, patterns } = intelligence;

  let context = `
=== WINNERS BANK INTELLIGENCE ===
Analyzing ${intelligence.totalCount} of your highest-performing videos:

`;

  // Top performing hooks with actual metrics
  const topWinners = winners.slice(0, 5);
  context += `TOP PERFORMING HOOKS:\n`;
  topWinners.forEach((w, i) => {
    context += `${i + 1}. "${w.hook_text || 'Unknown hook'}"
   - Views: ${w.views?.toLocaleString() || 'N/A'} | Engagement: ${w.engagement_rate?.toFixed(1) || 'N/A'}%
   - Hook type: ${w.hook_type || 'Unknown'} | Format: ${w.content_format || 'Unknown'}
`;
    if (w.ai_analysis?.hook_analysis?.pattern) {
      context += `   - Pattern: ${w.ai_analysis.hook_analysis.pattern}\n`;
    }
  });

  // AI-extracted patterns from aggregated data
  if (patterns) {
    context += `\nPATTERNS THAT WORK FOR YOUR AUDIENCE:\n`;

    if (patterns.top_hook_types) {
      const topHooks = Object.entries(patterns.top_hook_types)
        .sort((a, b) => (b[1]?.count || 0) - (a[1]?.count || 0))
        .slice(0, 3)
        .map(([type]) => type);
      if (topHooks.length > 0) {
        context += `- Winning hook types: ${topHooks.join(', ')}\n`;
      }
    }

    if (patterns.optimal_video_length?.sweet_spot) {
      context += `- Optimal length: ${patterns.optimal_video_length.sweet_spot} seconds\n`;
    }

    if (patterns.common_patterns && patterns.common_patterns.length > 0) {
      context += `- Success patterns:\n`;
      patterns.common_patterns.slice(0, 3).forEach(p => {
        context += `  - ${p}\n`;
      });
    }

    if (patterns.underperforming_patterns && patterns.underperforming_patterns.length > 0) {
      context += `\nWHAT TO AVOID (underperformed for you):\n`;
      patterns.underperforming_patterns.slice(0, 3).forEach(p => {
        context += `  - ${p}\n`;
      });
    }
  }

  // Specific learnings from AI analysis
  const analyzedWinners = winners.filter(w => w.ai_analysis);
  if (analyzedWinners.length > 0) {
    context += `\nKEY LEARNINGS FROM AI ANALYSIS:\n`;
    analyzedWinners.slice(0, 3).forEach(w => {
      if (w.ai_analysis?.recommendations) {
        w.ai_analysis.recommendations.slice(0, 1).forEach(rec => {
          context += `- ${rec}\n`;
        });
      }
    });
  }

  context += `
CRITICAL: Apply these proven patterns to the new script.
- Use similar hook structures that worked
- Match the pacing and format that resonated
- Avoid patterns that underperformed
- Create something NEW that follows the same winning principles
===

`;

  return context;
}

/**
 * Build a prompt section for generating a variation of a specific winner
 */
export function buildWinnerVariationPrompt(winner: Winner): string {
  return `
=== GENERATE VARIATION OF WINNING CONTENT ===
You're creating a fresh variation of this PROVEN winner. Keep what works, make it new.

ORIGINAL WINNING CONTENT:
Hook: "${winner.hook_text || 'No hook recorded'}"
Format: ${winner.content_format || 'Unknown'}
Product: ${winner.product_name || 'Unknown'}

PERFORMANCE DATA:
- Views: ${winner.views?.toLocaleString() || 'N/A'}
- Engagement: ${winner.engagement_rate?.toFixed(1) || 'N/A'}%
- Watch completion: ${winner.retention_full?.toFixed(1) || 'N/A'}%

${winner.ai_analysis ? `
WHY IT WORKED (AI Analysis):
${winner.ai_analysis.summary}

HOOK PATTERN: ${winner.ai_analysis.hook_analysis?.pattern || 'Unknown'}
CONTENT PATTERN: ${winner.ai_analysis.patterns?.content_pattern || 'Unknown'}
` : ''}

${winner.user_notes ? `
CREATOR'S INSIGHT: "${winner.user_notes}"
` : ''}

YOUR MISSION:
1. Keep the same HOOK PATTERN but with fresh words
2. Maintain the same ENERGY and PACING
3. Use similar STRUCTURE but different specific content
4. Same emotional triggers, different examples
5. Make it feel new, not recycled
===

`;
}

/**
 * Summarize winners for a quick context snippet
 */
export function summarizeWinners(winners: Winner[]): string {
  if (!winners || winners.length === 0) return 'No winners data available.';

  const avgEngagement = winners
    .filter(w => w.engagement_rate)
    .reduce((sum, w) => sum + (w.engagement_rate || 0), 0) / winners.length;

  const hookTypes = [...new Set(winners.map(w => w.hook_type).filter(Boolean))];
  const formats = [...new Set(winners.map(w => w.content_format).filter(Boolean))];

  return `${winners.length} winners | Avg engagement: ${avgEngagement.toFixed(1)}% | Top hooks: ${hookTypes.slice(0, 3).join(', ')} | Formats: ${formats.slice(0, 3).join(', ')}`;
}
