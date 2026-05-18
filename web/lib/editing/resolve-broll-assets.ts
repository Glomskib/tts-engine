/**
 * Resolve `broll` actions in an EditPlan against a real stock provider.
 *
 * Brandon's locked decision: b-roll must match the WORDS BEING SPOKEN in each
 * ~3 second window, not the overall topic of the clip. This module:
 *
 *   1. Walks every action with type==='broll' in the plan.
 *   2. Builds a keyword query from the transcript words that fall inside the
 *      broll action's [start_sec, end_sec] window — content words only,
 *      noun-biased, top 3.
 *   3. Falls back to the action's existing `prompt` if the transcript window
 *      is empty (e.g. a hook overlay before speech starts).
 *   4. Calls fetchStockBroll() against Pexels and writes the result URL
 *      into action.asset_url.
 *   5. If no broll actions exist but we DO have a transcript, plants
 *      cutaways at major topic shifts (every ~4s after the hook) so the
 *      finished video has visual variety instead of one continuous shot.
 *
 * The resolver is best-effort: if Pexels isn't configured (no API key),
 * or no result matches, asset_url stays null and the renderer keeps the
 * raw clip for that span. Never throws.
 */

import { fetchStockBroll, STOCK_BROLL_AVAILABLE } from '@/lib/marketplace/broll-providers';
import type { EditPlan, EditPlanAction } from './types';
import type { TranscriptWord } from './dedupe-takes';

export interface ResolveBrollOptions {
  /** Skip resolution entirely. */
  disabled?: boolean;
  /** Plant fresh cutaways if no broll actions exist. */
  plantCutaways?: boolean;
  /** Cutaway cadence in seconds. Default 5s. */
  cutawayEverySec?: number;
  /** Cutaway duration in seconds. Default 3s. */
  cutawayDurationSec?: number;
  /** Don't plant cutaways before this point — leaves the hook untouched. */
  noCutawayBeforeSec?: number;
  /** Hard max number of cutaways. Pexels rate limit safety. */
  maxBrolls?: number;
}

export async function resolveBrollAssets(
  plan: EditPlan,
  transcript: TranscriptWord[] | null | undefined,
  opts: ResolveBrollOptions = {},
): Promise<{ plan: EditPlan; resolved: number; planted: number }> {
  if (opts.disabled || !STOCK_BROLL_AVAILABLE) {
    return { plan, resolved: 0, planted: 0 };
  }

  const maxBrolls = opts.maxBrolls ?? 6;
  const cutawayEvery = opts.cutawayEverySec ?? 5;
  const cutawayDuration = opts.cutawayDurationSec ?? 3;
  const noBefore = opts.noCutawayBeforeSec ?? 3;

  const existingBrolls = plan.actions.filter(a => a.type === 'broll');

  // 1. Plant cutaways if the plan has none and we have transcript signal.
  const plantedActions: EditPlanAction[] = [];
  if (opts.plantCutaways !== false && existingBrolls.length === 0 && transcript && transcript.length > 8) {
    const lastEnd = transcript[transcript.length - 1].end;
    const duration = Math.min(plan.source_duration_sec, lastEnd);
    let t = Math.max(noBefore, cutawayEvery);
    while (t + cutawayDuration <= duration && plantedActions.length < maxBrolls) {
      plantedActions.push({
        type: 'broll',
        start_sec: t,
        end_sec: t + cutawayDuration,
        asset_url: null,
        prompt: '', // filled in below from transcript window
      });
      t += cutawayEvery + cutawayDuration;
    }
  }

  const allBrolls = [...existingBrolls, ...plantedActions];

  let resolved = 0;
  const planted = plantedActions.length;

  // 2. For each broll action, derive keyword from transcript window + fetch.
  for (const action of allBrolls) {
    if (action.type !== 'broll') continue;
    if (resolved >= maxBrolls) break;

    const windowQuery = transcriptWindowQuery(transcript, action.start_sec, action.end_sec);
    const baseQuery = (action.prompt || '').trim();
    // Prefer transcript-derived query (matches spoken words). Fall back to the
    // pre-existing prompt if the window has no usable text.
    const query = windowQuery || baseQuery;
    if (!query) continue;

    try {
      const res = await fetchStockBroll({
        keyword: query,
        description: query,
        recommendedFor: 'general',
        minDurationSec: Math.max(2, (action.end_sec - action.start_sec) * 0.8),
        maxDurationSec: Math.max(6, (action.end_sec - action.start_sec) * 2.5),
        orientation: 'portrait',
      });
      if (res?.url) {
        action.asset_url = res.url;
        action.prompt = query;
        resolved++;
      }
    } catch (err) {
      // Swallow — fall through with null asset
      console.warn('[resolve-broll] fetch failed', err);
    }
  }

  // 3. Append planted cutaways that actually got an asset to the plan.
  const plantedWithAssets = plantedActions.filter(
    a => a.type === 'broll' && a.asset_url,
  );
  if (plantedWithAssets.length > 0) {
    plan.actions.push(...plantedWithAssets);
  }

  return { plan, resolved, planted };
}

// ---- Helpers ----

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'just', 'like', 'me', 'my', 'no', 'not', 'now', 'of',
  'on', 'one', 'or', 'our', 'out', 'over', 'so', 'some', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to', 'too',
  'up', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who',
  'will', 'with', 'would', 'you', 'your', 'um', 'uh', 'erm', 'ah', 'eh',
  'okay', 'ok', 'right', 'yeah', 'yep', 'nope', 'well', 'actually', 'really',
  'literally', 'basically', 'anyway', 'thing', 'stuff',
]);

/** Pick 3 high-signal content words spoken inside [start, end]. */
function transcriptWindowQuery(
  transcript: TranscriptWord[] | null | undefined,
  start: number,
  end: number,
): string {
  if (!transcript || transcript.length === 0) return '';
  // Include words that even partially overlap the window.
  const inWindow = transcript.filter(w => w.end > start - 0.1 && w.start < end + 0.1);
  if (inWindow.length === 0) return '';

  const cleaned = inWindow
    .map(w => w.text.toLowerCase().replace(/[^a-z']/g, '').trim())
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));

  if (cleaned.length === 0) return '';

  // Frequency tally — most-repeated content words first.
  const freq = new Map<string, number>();
  for (const w of cleaned) freq.set(w, (freq.get(w) ?? 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);

  // Pick the top 3 distinct words. Preserve original word order among those.
  const topSet = new Set(ranked.slice(0, 3).map(r => r[0]));
  const ordered: string[] = [];
  for (const w of cleaned) {
    if (topSet.has(w) && !ordered.includes(w)) ordered.push(w);
    if (ordered.length === 3) break;
  }
  return ordered.join(' ');
}
