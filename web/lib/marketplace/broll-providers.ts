// ============================================================
// B-roll Scout — Provider interfaces + stubs
// ============================================================

export interface BrollRequest {
  keyword: string;
  description: string;
  recommendedFor: string; // e.g. "hook", "cta", "general"
}

export interface BrollResult {
  buffer: Buffer | null;
  url: string | null;
  sourceType: 'ai' | 'stock' | 'reference';
  prompt: string;
  durationSeconds: number | null;
  tags: string[];
}

/** Whether AI b-roll generation is available (stub until provider is configured). */
export const AI_BROLL_AVAILABLE = false;

/** Whether stock b-roll fetching is available (stub until provider is configured). */
export const STOCK_BROLL_AVAILABLE = false;

// ---- AI Generator stub (e.g. Veo / Runway) ----
export async function generateAiBroll(_req: BrollRequest): Promise<BrollResult | null> {
  // STUB: Awaiting AI video provider integration (Runway / Veo)
  return null;
}

// ---- Stock provider stub (future) ----
export async function fetchStockBroll(_req: BrollRequest): Promise<BrollResult | null> {
  // STUB: Awaiting stock provider integration (Pexels / Storyblocks)
  return null;
}

// ---- Parse script notes into structured b-roll requests ----
export function parseBrollSuggestions(
  notes: string | null,
  brollSuggestions: string | null,
): BrollRequest[] {
  const requests: BrollRequest[] = [];
  const text = [notes, brollSuggestions].filter(Boolean).join('\n');
  if (!text.trim()) return requests;

  // Split on newlines, bullet points, or numbered items
  const lines = text
    .split(/[\n\r]+/)
    .map(l => l.replace(/^[\s\-*•\d.)]+/, '').trim())
    .filter(l => l.length > 3);

  for (const line of lines) {
    // Try to extract a recommended-for hint from brackets like [hook] or [cta]
    const hintMatch = line.match(/\[([^\]]+)\]/);
    const hint = hintMatch ? hintMatch[1].toLowerCase() : 'general';
    const cleanLine = line.replace(/\[[^\]]+\]/, '').trim();

    // Extract keywords (first 3 significant words)
    const words = cleanLine.split(/\s+/).filter(w => w.length > 2).slice(0, 3);

    requests.push({
      keyword: words.join(' '),
      description: cleanLine,
      recommendedFor: hint,
    });
  }

  return requests;
}
