/**
 * Plagiarism guard for creator-style content generation.
 *
 * Checks generated text against source transcripts using sliding-window
 * n-gram matching. Reusable by any generation pipeline.
 */

export interface PlagiarismViolation {
  matched_phrase: string;
  source_index: number;
  position: number;
}

export interface PlagiarismResult {
  passed: boolean;
  violations: PlagiarismViolation[];
  similarity_score: number;
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Check generated text for excessive overlap with source transcripts.
 *
 * Uses an n-gram hash set for O(1) lookup per window position.
 *
 * @param generatedText - The text to check
 * @param sourceTranscripts - Array of source transcripts to compare against
 * @param maxConsecutiveWords - Maximum allowed consecutive matching words (default: 20)
 */
export function checkPlagiarism(
  generatedText: string,
  sourceTranscripts: string[],
  maxConsecutiveWords: number = 20,
): PlagiarismResult {
  const genWords = normalizeWords(generatedText);

  if (genWords.length === 0 || sourceTranscripts.length === 0) {
    return { passed: true, violations: [], similarity_score: 0 };
  }

  // Build n-gram set from all source transcripts
  const ngramSet = new Set<string>();
  const n = maxConsecutiveWords;

  for (const transcript of sourceTranscripts) {
    const words = normalizeWords(transcript);
    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ');
      ngramSet.add(ngram);
    }
  }

  // Slide window over generated text
  const violations: PlagiarismViolation[] = [];
  let matchedPositions = 0;

  for (let i = 0; i <= genWords.length - n; i++) {
    const ngram = genWords.slice(i, i + n).join(' ');
    if (ngramSet.has(ngram)) {
      // Find which source contains this match
      let sourceIndex = 0;
      for (let s = 0; s < sourceTranscripts.length; s++) {
        const srcNorm = normalizeWords(sourceTranscripts[s]).join(' ');
        if (srcNorm.includes(ngram)) {
          sourceIndex = s;
          break;
        }
      }

      violations.push({
        matched_phrase: genWords.slice(i, i + n).join(' '),
        source_index: sourceIndex,
        position: i,
      });
      matchedPositions += n;
      i += n - 1; // skip past this match
    }
  }

  const similarity_score = genWords.length > 0
    ? Math.min(1, matchedPositions / genWords.length)
    : 0;

  return {
    passed: violations.length === 0,
    violations,
    similarity_score,
  };
}
