/**
 * Hook Intelligence Layer
 *
 * Fetches proven hooks, rejected hooks, weak hooks, and winners bank
 * context from the database to inform hook generation.
 *
 * All functions gracefully degrade — if tables don't exist or queries
 * fail, they return empty arrays. No generation should break because
 * intelligence data is unavailable.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ── Types ─────────────────────────────────────────────────────────

export interface ProvenHook {
  hook_text: string;
  hook_type: string;
  hook_family: string | null;
  approved_count: number;
  posted_count: number;
  winner_count: number;
}

export interface RejectedHook {
  hook_text: string;
  hook_type: string;
  hook_family: string | null;
  rejected_count: number;
  reason_codes: string[];
}

export interface WeakHook {
  hook_text: string;
  hook_type: string;
  hook_family: string | null;
  underperform_count: number;
  reason_codes: string[];
}

export interface WinnerExtract {
  hook: string;
  hook_family: string;
  structure: string[];
  quality: number;
}

export interface HookIntelligence {
  proven: ProvenHook[];
  rejected: RejectedHook[];
  weak: WeakHook[];
  winners: WinnerExtract[];
}

// ── Fetchers ──────────────────────────────────────────────────────

async function fetchProvenHooks(niche?: string): Promise<ProvenHook[]> {
  try {
    let query = supabaseAdmin
      .from('proven_hooks')
      .select('hook_text, hook_type, hook_family, approved_count, posted_count, winner_count')
      .gte('approved_count', 1)
      .order('winner_count', { ascending: false })
      .order('posted_count', { ascending: false })
      .limit(15);

    if (niche) {
      query = query.ilike('niche', `%${niche}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as ProvenHook[];
  } catch {
    return [];
  }
}

async function fetchRejectedHooks(niche?: string): Promise<RejectedHook[]> {
  try {
    let query = supabaseAdmin
      .from('proven_hooks')
      .select('id, hook_text, hook_type, hook_family, rejected_count')
      .gte('rejected_count', 1)
      .order('rejected_count', { ascending: false })
      .limit(15);

    if (niche) {
      query = query.ilike('niche', `%${niche}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // Fetch reason codes for rejected hooks
    const hookIds = data.map((h: { id: string }) => h.id);
    let reasonsByHookId: Record<string, string[]> = {};

    if (hookIds.length > 0) {
      const { data: feedbackData } = await supabaseAdmin
        .from('hook_feedback')
        .select('hook_id, reason_code')
        .eq('outcome', 'rejected')
        .in('hook_id', hookIds)
        .not('reason_code', 'is', null)
        .limit(100);

      if (feedbackData) {
        reasonsByHookId = {};
        for (const fb of feedbackData as Array<{ hook_id: string; reason_code: string }>) {
          if (fb.hook_id && fb.reason_code) {
            if (!reasonsByHookId[fb.hook_id]) reasonsByHookId[fb.hook_id] = [];
            if (!reasonsByHookId[fb.hook_id].includes(fb.reason_code)) {
              reasonsByHookId[fb.hook_id].push(fb.reason_code);
            }
          }
        }
      }
    }

    return data.map((h: { id: string; hook_text: string; hook_type: string; hook_family: string | null; rejected_count: number }) => ({
      hook_text: h.hook_text,
      hook_type: h.hook_type,
      hook_family: h.hook_family,
      rejected_count: h.rejected_count,
      reason_codes: reasonsByHookId[h.id] || [],
    }));
  } catch {
    return [];
  }
}

async function fetchWeakHooks(niche?: string): Promise<WeakHook[]> {
  try {
    let query = supabaseAdmin
      .from('proven_hooks')
      .select('id, hook_text, hook_type, hook_family, underperform_count')
      .gte('underperform_count', 1)
      .lt('rejected_count', 3)
      .order('underperform_count', { ascending: false })
      .limit(10);

    if (niche) {
      query = query.ilike('niche', `%${niche}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    const hookIds = data.map((h: { id: string }) => h.id);
    let reasonsByHookId: Record<string, string[]> = {};

    if (hookIds.length > 0) {
      const { data: feedbackData } = await supabaseAdmin
        .from('hook_feedback')
        .select('hook_id, reason_code')
        .eq('outcome', 'underperform')
        .in('hook_id', hookIds)
        .not('reason_code', 'is', null)
        .limit(100);

      if (feedbackData) {
        for (const fb of feedbackData as Array<{ hook_id: string; reason_code: string }>) {
          if (fb.hook_id && fb.reason_code) {
            if (!reasonsByHookId[fb.hook_id]) reasonsByHookId[fb.hook_id] = [];
            if (!reasonsByHookId[fb.hook_id].includes(fb.reason_code)) {
              reasonsByHookId[fb.hook_id].push(fb.reason_code);
            }
          }
        }
      }
    }

    return data.map((h: { id: string; hook_text: string; hook_type: string; hook_family: string | null; underperform_count: number }) => ({
      hook_text: h.hook_text,
      hook_type: h.hook_type,
      hook_family: h.hook_family,
      underperform_count: h.underperform_count || 0,
      reason_codes: reasonsByHookId[h.id] || [],
    }));
  } catch {
    return [];
  }
}

async function fetchWinnerExtracts(niche?: string): Promise<WinnerExtract[]> {
  try {
    let query = supabaseAdmin
      .from('reference_extracts')
      .select(`
        spoken_hook,
        hook_family,
        structure_tags,
        quality_score,
        reference_videos!inner (
          category,
          status
        )
      `)
      .eq('reference_videos.status', 'ready')
      .order('quality_score', { ascending: false })
      .limit(8);

    if (niche) {
      query = query.ilike('reference_videos.category', `%${niche}%`);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((e: { spoken_hook?: string; hook_family?: string; structure_tags?: string[]; quality_score?: number }) => ({
      hook: e.spoken_hook || '',
      hook_family: e.hook_family || '',
      structure: Array.isArray(e.structure_tags) ? e.structure_tags : [],
      quality: e.quality_score || 0,
    })).filter((e: WinnerExtract) => e.hook.length > 0);
  } catch {
    return [];
  }
}

// ── Main fetcher ──────────────────────────────────────────────────

/**
 * Fetch all hook intelligence in parallel.
 * Returns empty arrays for any source that fails.
 */
export async function fetchHookIntelligence(niche?: string): Promise<HookIntelligence> {
  const [proven, rejected, weak, winners] = await Promise.all([
    fetchProvenHooks(niche),
    fetchRejectedHooks(niche),
    fetchWeakHooks(niche),
    fetchWinnerExtracts(niche),
  ]);

  return { proven, rejected, weak, winners };
}

// ── Prompt builders ───────────────────────────────────────────────

/**
 * Build prompt context from hook intelligence.
 * Returns empty string if no intelligence is available.
 */
export function buildIntelligenceContext(intel: HookIntelligence): string {
  const sections: string[] = [];

  // Proven hooks — use as structural inspiration
  if (intel.proven.length > 0) {
    const top = intel.proven.slice(0, 8);
    sections.push(
      '=== PROVEN HOOKS (use as structural inspiration — do NOT copy) ===',
      'These hooks have been tested and performed well. Study the MECHANISM (tension, reveal, specificity) — not the words.',
      ...top.map((h, i) => `${i + 1}. [${h.hook_type}] "${h.hook_text}" (${h.winner_count > 0 ? `winner x${h.winner_count}` : `approved x${h.approved_count}`})`),
      '=== END PROVEN HOOKS ===',
    );
  }

  // Winner extracts — structural patterns from top videos
  if (intel.winners.length > 0) {
    const top = intel.winners.slice(0, 5);
    sections.push(
      '\n=== WINNING VIDEO HOOKS (study the structure and rhythm) ===',
      ...top.map((w, i) => {
        const tags = w.structure.length > 0 ? ` [${w.structure.join(', ')}]` : '';
        return `${i + 1}. "${w.hook}"${tags}`;
      }),
      '=== END WINNING HOOKS ===',
    );
  }

  // Rejected hooks — hard exclusions
  if (intel.rejected.length > 0) {
    const reasons = new Set<string>();
    intel.rejected.forEach(h => h.reason_codes.forEach(r => reasons.add(r)));

    sections.push(
      '\n=== REJECTED HOOKS (avoid these patterns completely) ===',
      'These hooks were rejected by the team. Do NOT use similar structures, phrases, or angles.',
      ...intel.rejected.slice(0, 6).map(h => `- "${h.hook_text}"${h.reason_codes.length > 0 ? ` (rejected for: ${h.reason_codes.join(', ')})` : ''}`),
      reasons.size > 0 ? `Common rejection reasons: ${[...reasons].join(', ')}` : '',
      '=== END REJECTED HOOKS ===',
    );
  }

  // Weak hooks — soft penalty patterns
  if (intel.weak.length > 0) {
    const reasons = new Set<string>();
    intel.weak.forEach(h => h.reason_codes.forEach(r => reasons.add(r)));

    if (reasons.size > 0) {
      sections.push(
        `\n=== UNDERPERFORMING PATTERNS (avoid) ===`,
        `These patterns underperformed: ${[...reasons].join(', ')}`,
        '=== END UNDERPERFORMING ===',
      );
    }
  }

  return sections.filter(Boolean).join('\n');
}
