/**
 * Creator DNA Context Builder
 * Builds prompt context from Creator DNA for script generation and other AI features.
 */

export interface CreatorDNA {
  total_videos_analyzed: number;
  hook_patterns: Record<string, any>;
  format_patterns: Record<string, any>;
  language_patterns: Record<string, any>;
  emotional_patterns: Record<string, any>;
  performance_patterns: Record<string, any>;
  niche_patterns: Record<string, any>;
  winning_formula: string | null;
  strengths: string[];
  weaknesses: string[];
  growth_recommendations: string[];
}

export function buildCreatorDNAContext(dna: CreatorDNA | null): string {
  if (!dna || dna.total_videos_analyzed < 20) return '';

  const bestHook = dna.hook_patterns?.best_performing || 'unknown';
  const bestFormat = dna.format_patterns?.best_for_engagement || 'unknown';
  const optimalLength = dna.performance_patterns?.optimal_video_length?.sweet_spot;
  const pace = dna.language_patterns?.speaking_pace || 'moderate';

  let context = `
=== CREATOR DNA (from ${dna.total_videos_analyzed} analyzed videos) ===

WINNING FORMULA:
${dna.winning_formula || 'Still building — need more analyzed videos'}

STRENGTHS:
${(dna.strengths || []).map(s => `✓ ${s}`).join('\n')}

WHAT TO AVOID:
${(dna.weaknesses || []).map(w => `✗ ${w}`).join('\n')}

HOOK PATTERNS:
- Best performing: ${bestHook}
- ${dna.hook_patterns?.underutilized ? `Underutilized (try more): ${dna.hook_patterns.underutilized}` : ''}

YOUR VOICE:
- Pace: ${pace}
${dna.language_patterns?.signature_phrases ? `- Signature phrases: ${dna.language_patterns.signature_phrases.slice(0, 5).join(', ')}` : ''}
${dna.language_patterns?.power_phrases ? `- Power phrases: ${dna.language_patterns.power_phrases.slice(0, 3).join(', ')}` : ''}

OPTIMAL FORMAT:
${optimalLength ? `- Sweet spot: ${optimalLength}s` : ''}
- Best format: ${bestFormat}

CRITICAL: Generate content that matches THIS creator's proven patterns.
Use their natural language. Match their pacing. Play to their strengths.
===

`;
  return context;
}

/**
 * Quick one-line summary for dashboard widgets
 */
export function summarizeDNA(dna: CreatorDNA | null): string {
  if (!dna || dna.total_videos_analyzed < 20) {
    return `${dna?.total_videos_analyzed || 0} videos analyzed — need 20+ for DNA profile`;
  }

  const bestHook = dna.hook_patterns?.best_performing || '?';
  const bestFormat = dna.format_patterns?.best_for_engagement || '?';
  return `${dna.total_videos_analyzed} videos | Best hook: ${bestHook} | Best format: ${bestFormat}`;
}
