/**
 * Heuristic intent detection from a full transcript.
 *
 * Returns 'affiliate', 'nonprofit', or 'unknown'. This is a SAFETY NET —
 * the user picks mode at upload time. We surface `detected_intent` on
 * the run so the UI can suggest a switch when the heuristic strongly
 * disagrees with the user's choice (e.g., they picked nonprofit but the
 * footage is clearly a product unboxing).
 *
 * Pure function — no LLM, no DB.
 */

export type DetectedIntent = 'affiliate' | 'nonprofit' | 'unknown';

const AFFILIATE_SIGNALS = [
  'product','tiktok shop','amazon','shopify','order','discount','code',
  'promo','sale','buy','purchase','grab','review','unbox','shipping',
  'received','arrived','box','package','tested','tried','using','use it',
  'link in bio','link below','my favorite','i love this','game changer',
  'i recommend','check this out','swipe up','tap to shop','add to cart',
];

const NONPROFIT_SIGNALS = [
  'donate','donation','volunteer','volunteers','mission','impact',
  'fundraise','fundraising','sponsor','sponsorship','event','community',
  'charity','non-profit','nonprofit','foundation','support our',
  'register','rsvp','sign up','join us','together','our team','make a difference',
  'awareness','cause','give back','your gift','your support','thanks to',
  'we did it','crossed the','medal','rider','runner','walker','bike','ride for',
  'walk for','run for',
];

function countHits(haystack: string, needles: string[]): number {
  let count = 0;
  for (const n of needles) {
    if (!n) continue;
    // Word-ish boundary: avoid false hits inside larger words.
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(n)}([^a-z0-9]|$)`, 'g');
    const matches = haystack.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface IntentResult {
  intent: DetectedIntent;
  confidence: number;       // 0..1, higher = stronger signal
  affiliateHits: number;
  nonprofitHits: number;
}

export function detectIntent(transcriptText: string): IntentResult {
  const norm = transcriptText.toLowerCase();
  const affiliateHits = countHits(norm, AFFILIATE_SIGNALS);
  const nonprofitHits = countHits(norm, NONPROFIT_SIGNALS);
  const total = affiliateHits + nonprofitHits;

  if (total < 2) {
    return { intent: 'unknown', confidence: 0, affiliateHits, nonprofitHits };
  }

  if (affiliateHits >= nonprofitHits * 2 && affiliateHits >= 2) {
    return {
      intent: 'affiliate',
      confidence: Math.min(1, affiliateHits / Math.max(1, total)),
      affiliateHits,
      nonprofitHits,
    };
  }
  if (nonprofitHits >= affiliateHits * 2 && nonprofitHits >= 2) {
    return {
      intent: 'nonprofit',
      confidence: Math.min(1, nonprofitHits / Math.max(1, total)),
      affiliateHits,
      nonprofitHits,
    };
  }
  return {
    intent: affiliateHits >= nonprofitHits ? 'affiliate' : 'nonprofit',
    confidence: Math.min(0.6, Math.max(affiliateHits, nonprofitHits) / Math.max(1, total)),
    affiliateHits,
    nonprofitHits,
  };
}
