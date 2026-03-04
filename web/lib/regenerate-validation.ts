/**
 * Validation utilities for AI script regeneration.
 *
 * Ensures regenerated scripts stay on-track: same structure, same CTA,
 * similar length — only phrasing changes.
 */

/** Split a script into structural beats/sections by line breaks or [stage directions]. */
export function extractOutline(script: string): string[] {
  // Split on double newlines or [stage direction] markers to find beats
  const lines = script
    .split(/\n{2,}/)
    .map((l) => l.trim())
    .filter(Boolean);

  // If the script is dense (no double-newlines), split on single newlines
  if (lines.length <= 1) {
    return script
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  return lines;
}

/** Build a short outline string for the prompt (numbered beats). */
export function buildOutlinePrompt(script: string): string {
  const beats = extractOutline(script);
  return beats
    .map((beat, i) => {
      // Truncate each beat to first ~60 chars for the outline
      const summary = beat.length > 80 ? beat.slice(0, 80) + '...' : beat;
      return `${i + 1}. ${summary}`;
    })
    .join('\n');
}

/** Extract important keywords from a CTA line (3+ char words, lowercased). */
export function extractCtaKeywords(cta: string): string[] {
  if (!cta) return [];
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'let',
    'may', 'who', 'did', 'get', 'got', 'him', 'she', 'too', 'use', 'this',
    'that', 'with', 'have', 'from', 'they', 'been', 'said', 'each', 'which',
    'their', 'will', 'other', 'about', 'many', 'then', 'them', 'these',
    'some', 'would', 'make', 'like', 'just', 'over', 'such', 'take', 'than',
    'very', 'your', 'into', 'also', 'it\'s', 'don\'t', 'what',
  ]);

  return cta
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w))
    .filter((v, i, a) => a.indexOf(v) === i); // unique
}

export interface ValidationResult {
  passed: boolean;
  sectionCountOk: boolean;
  ctaKeywordsOk: boolean;
  lengthOk: boolean;
  details: string;
}

/**
 * Validate a regenerated script against the original.
 *
 * Checks:
 * 1. Section count is within ±1 of original
 * 2. At least half of original CTA keywords appear in the new script
 * 3. Word count is within ±15% of original
 */
export function validateRegeneration(
  originalScript: string,
  originalCta: string,
  newScript: string,
  newCta: string
): ValidationResult {
  const issues: string[] = [];

  // 1. Section count
  const origSections = extractOutline(originalScript).length;
  const newSections = extractOutline(newScript).length;
  const sectionCountOk = Math.abs(origSections - newSections) <= 1;
  if (!sectionCountOk) {
    issues.push(
      `Section count mismatch: original ${origSections}, new ${newSections}`
    );
  }

  // 2. CTA keyword overlap
  const ctaKw = extractCtaKeywords(originalCta);
  let ctaKeywordsOk = true;
  if (ctaKw.length > 0) {
    const newScriptLower = (newScript + ' ' + newCta).toLowerCase();
    const matched = ctaKw.filter((kw) => newScriptLower.includes(kw));
    // Require at least half of CTA keywords to appear
    ctaKeywordsOk = matched.length >= Math.ceil(ctaKw.length / 2);
    if (!ctaKeywordsOk) {
      issues.push(
        `CTA keywords missing: expected [${ctaKw.join(', ')}], found [${matched.join(', ')}]`
      );
    }
  }

  // 3. Length within ±15%
  const origWords = originalScript.split(/\s+/).filter(Boolean).length;
  const newWords = newScript.split(/\s+/).filter(Boolean).length;
  const ratio = origWords > 0 ? newWords / origWords : 1;
  const lengthOk = ratio >= 0.85 && ratio <= 1.15;
  if (!lengthOk) {
    issues.push(
      `Length out of range: original ${origWords} words, new ${newWords} words (${Math.round(ratio * 100)}%)`
    );
  }

  return {
    passed: sectionCountOk && ctaKeywordsOk && lengthOk,
    sectionCountOk,
    ctaKeywordsOk,
    lengthOk,
    details: issues.length ? issues.join('; ') : 'All checks passed',
  };
}
