// Lightweight brand-safety filter for user-facing surfaces.
//
// Purpose: a chunk of legacy test/seed data in saved_skits + other tables
// contains vulgar or sexual titles that are not safe to surface in the
// creator dashboard. This helper lets routes/components redact them without
// deleting the underlying rows.

const UNSAFE_PATTERNS: RegExp[] = [
  // crude slurs / sexual content / gratuitous profanity
  /\b(fuck|shit|cunt|dick|cock|pussy|porn|nsfw|anal|bdsm|horny|whore|slut|bitch|bastard|asshole)\b/i,
  // common crude fillers used in test seeds
  /\b(milf|dilf|boner|orgasm|masturbat)/i,
];

export function isUnsafeTitle(text: string | null | undefined): boolean {
  if (!text) return false;
  return UNSAFE_PATTERNS.some(rx => rx.test(text));
}

export function sanitizeTitle(text: string | null | undefined, fallback = 'Untitled'): string {
  if (!text) return fallback;
  return isUnsafeTitle(text) ? fallback : text;
}

export function filterSafeRecords<T extends { title?: string | null; product_name?: string | null }>(
  records: T[],
): T[] {
  return records.filter(r => !isUnsafeTitle(r.title) && !isUnsafeTitle(r.product_name ?? null));
}
