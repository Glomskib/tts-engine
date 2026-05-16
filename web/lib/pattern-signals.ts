// ============================================================
// FlashFlow — Pattern signal loader for the generation prompt.
// Drop into: web/lib/pattern-signals.ts
//
// This is the moat. The generation endpoint calls
// `loadPatternSignals(niche)` and injects the result into the
// system prompt so the AI biases toward globally-winning
// patterns and away from globally-losing ones.
//
// Uses SERVICE ROLE key so it can read the cross-account
// pattern_pool view. Never expose this client-side.
// ============================================================

import { createClient } from '@supabase/supabase-js';

export type PatternRow = {
  bucket: 'top' | 'bottom';
  hook_type: string | null;
  persona: string | null;
  cta_style: string | null;
  tone: string | null;
  pace: string | null;
  shrunk_score: number;
  sample_size: number;
};

let _admin: ReturnType<typeof createClient> | null = null;
function admin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY — pattern signals require service role');
  }
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

/**
 * Load the top and bottom performing patterns for a niche.
 * Falls back to global signals if the niche has too few samples.
 */
export async function loadPatternSignals(opts: {
  niche?: string | null;
  topN?: number;
  bottomN?: number;
  minSamples?: number;
}): Promise<{ top: PatternRow[]; bottom: PatternRow[] }> {
  const { niche, topN = 5, bottomN = 5, minSamples = 3 } = opts;

  // Supabase's generated types reject nulls for RPC args and don't know
  // about this function until the migration is applied, so we cast the call
  // through `any`. Once the schema is in and Supabase types regenerate, we
  // can drop the casts.
  // First try niche-specific
  let data: PatternRow[] | null = null;
  let error: unknown = null;
  {
    const res = await admin().rpc(
      'get_pattern_signals' as never,
      {
        p_niche: niche ?? undefined,
        p_top_n: topN,
        p_bottom_n: bottomN,
        p_min_samples: minSamples,
      } as never
    );
    data = (res.data ?? null) as PatternRow[] | null;
    error = res.error;
  }

  // Fallback: if we didn't get enough signal, query globally
  if (!error && niche && ((data?.length ?? 0) < (topN + bottomN) / 2)) {
    const fallback = await admin().rpc(
      'get_pattern_signals' as never,
      {
        p_niche: undefined,
        p_top_n: topN,
        p_bottom_n: bottomN,
        p_min_samples: minSamples,
      } as never
    );
    if (!fallback.error) data = (fallback.data ?? null) as PatternRow[] | null;
  }

  if (error || !data) return { top: [], bottom: [] };

  const rows = data;
  return {
    top: rows.filter((r) => r.bucket === 'top'),
    bottom: rows.filter((r) => r.bucket === 'bottom'),
  };
}

/**
 * Render the patterns as plain-language prompt sections.
 * Designed to be injected as a SYSTEM-level block before the
 * creator-specific instructions.
 */
export function renderPatternPromptBlock(signals: {
  top: PatternRow[];
  bottom: PatternRow[];
}): string {
  if (signals.top.length === 0 && signals.bottom.length === 0) {
    return ''; // No signal yet — don't pollute the prompt with empty sections
  }

  const describe = (r: PatternRow) =>
    [
      r.hook_type && `${r.hook_type} hook`,
      r.persona && `${r.persona} persona`,
      r.cta_style && `${r.cta_style} CTA`,
      r.tone && `${r.tone} tone`,
      r.pace && `${r.pace} pace`,
    ]
      .filter(Boolean)
      .join(' + ');

  const positive = signals.top
    .map((r) => `  • ${describe(r)} (score ${r.shrunk_score.toFixed(2)}, n=${r.sample_size})`)
    .join('\n');

  const negative = signals.bottom
    .map((r) => `  • ${describe(r)} (score ${r.shrunk_score.toFixed(2)}, n=${r.sample_size})`)
    .join('\n');

  return `
# PERFORMANCE-INFORMED GUIDANCE
Based on aggregated, anonymized performance data across all FlashFlow accounts:

## Patterns that PERFORM WELL (lean into these):
${positive || '  (insufficient data yet)'}

## Patterns that PERFORM POORLY (avoid these):
${negative || '  (insufficient data yet)'}

When generating scripts below, prefer the well-performing combinations.
Treat the poorly-performing combinations as anti-patterns — only use them
if the creator's brief explicitly requires them.
`.trim();
}

/**
 * Convenience: one call to get the prompt block.
 */
export async function buildPatternPromptBlock(niche?: string | null): Promise<string> {
  const signals = await loadPatternSignals({ niche });
  return renderPatternPromptBlock(signals);
}
