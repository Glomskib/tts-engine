/**
 * Hook Family Key Computation
 * Deterministic clustering of similar hooks into families.
 * Used for diversity selection to avoid near-duplicate options dominating the top.
 */

// Stopwords to remove (style words and common filler)
const STOPWORDS = new Set([
  "this", "that", "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for",
  "with", "is", "are", "was", "were", "be", "been", "being", "it", "you", "your",
  "i", "we", "they", "he", "she", "my", "our", "their", "just", "really", "very",
  "so", "now", "then", "here", "there", "stop", "whoa", "wait", "wow", "hey",
  "could", "would", "should", "can", "will", "might", "may", "must",
  "have", "has", "had", "do", "does", "did", "dont", "doesnt", "didnt",
  "not", "no", "yes", "if", "when", "how", "what", "why", "who", "where",
  "all", "some", "any", "every", "each", "both", "few", "more", "most",
  "other", "another", "such", "only", "own", "same", "than", "too", "also",
  "about", "after", "before", "between", "into", "through", "during", "above",
  "below", "from", "up", "down", "out", "off", "over", "under", "again",
  "further", "once", "am", "as", "at", "by", "its", "itself", "yourself",
  "himself", "herself", "themselves", "ourselves", "myself", "those", "these",
]);

// Maximum tokens to keep in family key
const MAX_TOKENS = 6;

// Minimum token length to keep
const MIN_TOKEN_LENGTH = 3;

/**
 * Compute a deterministic family key for clustering similar hooks.
 *
 * Rules:
 * 1) Normalize: lowercase, trim, collapse whitespace, strip punctuation
 * 2) Tokenize by whitespace
 * 3) Remove stopwords
 * 4) Remove purely numeric or very short tokens (<3 chars)
 * 5) Keep only first N tokens (N=6)
 * 6) Join with "-" to form key
 * 7) Fallback to first 30 chars or "misc" if empty
 */
export function computeHookFamilyKey(option: string): string {
  // 1) Normalize
  const normalized = option
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")  // punctuation to spaces
    .replace(/\s+/g, " ")       // collapse whitespace
    .trim();

  // 2) Tokenize
  const tokens = normalized.split(" ");

  // 3-4) Filter tokens
  const filtered = tokens.filter((token) => {
    // Remove stopwords
    if (STOPWORDS.has(token)) return false;
    // Remove purely numeric
    if (/^\d+$/.test(token)) return false;
    // Remove very short tokens
    if (token.length < MIN_TOKEN_LENGTH) return false;
    return true;
  });

  // 5) Keep only first N tokens
  const kept = filtered.slice(0, MAX_TOKENS);

  // 6) Join to form key
  if (kept.length > 0) {
    return kept.join("-");
  }

  // 7) Fallback
  if (normalized.length > 0) {
    const fallback = normalized.slice(0, 30).replace(/\s+/g, "-");
    return fallback || "misc";
  }

  return "misc";
}

/**
 * Get the family key for a hook option, preferring proven hook's stored family.
 *
 * @param option - The hook text
 * @param provenFamily - The hook_family from proven_hooks if matched, or null
 * @returns The family key to use for clustering
 */
export function getHookFamilyKey(
  option: string,
  provenFamily?: string | null
): string {
  // Use proven hook's family if available
  if (provenFamily && provenFamily.trim().length > 0) {
    return provenFamily.trim();
  }
  // Otherwise compute from text
  return computeHookFamilyKey(option);
}

export interface ScoredOptionWithFamily {
  option: string;
  score: number;
  familyKey: string;
  reasons?: string[];
}

/**
 * Select options with diversity across families.
 *
 * Algorithm:
 * 1) Sort by score descending
 * 2) Pass 1: Pick top option from each NEW family until maxK or exhausted
 * 3) Pass 2: Fill remaining slots with highest-scoring unpicked options
 * 4) Return in score order (highest first)
 */
export function selectDiverseOptions(
  options: ScoredOptionWithFamily[],
  maxK: number
): ScoredOptionWithFamily[] {
  if (options.length === 0 || maxK <= 0) return [];

  // Sort by score descending
  const sorted = [...options].sort((a, b) => b.score - a.score);

  const selected: ScoredOptionWithFamily[] = [];
  const seenFamilies = new Set<string>();
  const selectedIndices = new Set<number>();

  // Pass 1: Pick top option from each new family
  for (let i = 0; i < sorted.length && selected.length < maxK; i++) {
    const item = sorted[i];
    if (!seenFamilies.has(item.familyKey)) {
      seenFamilies.add(item.familyKey);
      selected.push(item);
      selectedIndices.add(i);
    }
  }

  // Pass 2: Fill remaining slots with highest-scoring unpicked
  for (let i = 0; i < sorted.length && selected.length < maxK; i++) {
    if (!selectedIndices.has(i)) {
      selected.push(sorted[i]);
      selectedIndices.add(i);
    }
  }

  // Already in score order from how we picked
  return selected;
}
