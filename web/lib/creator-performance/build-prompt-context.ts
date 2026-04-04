/**
 * Creator Performance → Prompt Context
 *
 * Turns creator_profile_dimensions into actionable generation context.
 * Used by hook generator, script generator, and content pack orchestrator.
 *
 * Gracefully returns empty string if no data exists — generation never breaks.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface PerformanceContext {
  /** Full prompt string to inject into generation prompts */
  prompt: string;
  /** Whether there's enough data for meaningful guidance */
  hasData: boolean;
  /** Overall confidence level */
  confidence: 'none' | 'low' | 'medium' | 'high';
}

interface DimRow {
  dimension: string;
  dimension_value: string;
  sample_size: number;
  avg_score: number;
  avg_views: number;
  avg_engagement_rate: number;
  win_rate: number;
}

interface ConfRow {
  dimension: string;
  confidence_level: string;
  total_samples: number;
}

/**
 * Fetch creator performance context for injection into generation prompts.
 *
 * workspaceId is the user's ID (single-workspace-per-user mode).
 * Returns empty prompt if no profile data exists.
 */
export async function fetchPerformanceContext(workspaceId: string): Promise<PerformanceContext> {
  const empty: PerformanceContext = { prompt: '', hasData: false, confidence: 'none' };

  try {
    // Fetch top dimensions (sample_size >= 2, ordered by score)
    const [dimsRes, confRes] = await Promise.all([
      supabaseAdmin
        .from('creator_profile_dimensions')
        .select('dimension, dimension_value, sample_size, avg_score, avg_views, avg_engagement_rate, win_rate')
        .eq('workspace_id', workspaceId)
        .gte('sample_size', 2)
        .order('avg_score', { ascending: false })
        .limit(60),
      supabaseAdmin
        .from('creator_profile_confidence')
        .select('dimension, confidence_level, total_samples')
        .eq('workspace_id', workspaceId),
    ]);

    const dims = (dimsRes.data || []) as DimRow[];
    const confs = (confRes.data || []) as ConfRow[];

    if (dims.length === 0) return empty;

    const totalSamples = confs.reduce((sum, c) => sum + c.total_samples, 0);
    const confidence: PerformanceContext['confidence'] =
      totalSamples >= 20 ? 'high' : totalSamples >= 5 ? 'medium' : 'low';

    const confMap = new Map(confs.map(c => [c.dimension, c.confidence_level]));

    // Group by dimension
    const grouped = new Map<string, DimRow[]>();
    for (const d of dims) {
      if (!grouped.has(d.dimension)) grouped.set(d.dimension, []);
      grouped.get(d.dimension)!.push(d);
    }

    const sections: string[] = [];

    sections.push(`=== YOUR PERFORMANCE PROFILE (${totalSamples} data points, ${confidence} confidence) ===`);

    if (confidence === 'low') {
      sections.push('Note: Limited data — treat as early signals, not hard rules. Still exploring what works best.');
    }

    // Hook patterns
    const hookPatterns = grouped.get('hook_pattern')?.slice(0, 3);
    if (hookPatterns && hookPatterns.length > 0) {
      const dimConf = confMap.get('hook_pattern') || 'low';
      sections.push(`\nSTRONGEST HOOK PATTERNS (${dimConf} confidence):`);
      for (const h of hookPatterns) {
        sections.push(`  - "${h.dimension_value}" (score: ${h.avg_score}, ${h.sample_size} uses${h.win_rate > 0 ? `, ${h.win_rate}% win rate` : ''})`);
      }
      sections.push('→ Bias hooks toward these proven structures.');
    }

    // Hook types
    const hookTypes = grouped.get('hook_type')?.slice(0, 3);
    if (hookTypes && hookTypes.length > 0) {
      sections.push(`\nBEST HOOK TYPES:`);
      for (const h of hookTypes) {
        sections.push(`  - ${h.dimension_value} (score: ${h.avg_score}, used ${h.sample_size}x)`);
      }
    }

    // Content angles
    const angles = grouped.get('angle')?.slice(0, 3);
    if (angles && angles.length > 0) {
      const dimConf = confMap.get('angle') || 'low';
      sections.push(`\nSTRONGEST CONTENT ANGLES (${dimConf} confidence):`);
      for (const a of angles) {
        sections.push(`  - "${a.dimension_value}" (score: ${a.avg_score}, ${a.avg_views.toLocaleString()} avg views)`);
      }
      sections.push('→ Lean toward these angles when choosing content direction.');
    }

    // Formats
    const formats = grouped.get('format')?.slice(0, 3);
    if (formats && formats.length > 0) {
      sections.push(`\nBEST FORMATS:`);
      for (const f of formats) {
        sections.push(`  - ${f.dimension_value} (score: ${f.avg_score}, ${f.avg_engagement_rate}% engagement)`);
      }
    }

    // Length buckets
    const lengths = grouped.get('length_bucket')?.slice(0, 2);
    if (lengths && lengths.length > 0) {
      sections.push(`\nOPTIMAL LENGTH: ${lengths[0].dimension_value} (score: ${lengths[0].avg_score})`);
    }

    // Weak patterns (bottom performers — things to avoid)
    const weakPatterns = findWeakPatterns(dims);
    if (weakPatterns.length > 0) {
      sections.push(`\nWEAK PATTERNS (consider avoiding):`);
      for (const w of weakPatterns.slice(0, 3)) {
        sections.push(`  - ${w.dimension}: "${w.dimension_value}" (score: ${w.avg_score}, ${w.sample_size} uses)`);
      }
    }

    sections.push('');
    sections.push('Use this profile to shape your output. Match proven patterns. Avoid weak ones.');
    sections.push('===');

    return {
      prompt: sections.join('\n'),
      hasData: true,
      confidence,
    };
  } catch {
    // Non-fatal — generation continues without performance context
    return empty;
  }
}

/**
 * Find consistently underperforming patterns (low score with enough samples).
 */
function findWeakPatterns(dims: DimRow[]): DimRow[] {
  return dims
    .filter(d => d.sample_size >= 3 && d.avg_score < 30)
    .sort((a, b) => a.avg_score - b.avg_score)
    .slice(0, 5);
}
