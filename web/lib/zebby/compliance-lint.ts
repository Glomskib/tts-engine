/**
 * @module zebby/compliance-lint
 *
 * Brand-safe compliance scanner for Zebby's World content. Runs on every
 * generated caption, CTA, and social-post body before they hit the user-facing
 * preview. Enforces the rules from prompts/zebby_style.md:
 *
 *   - NO medical advice (no "you should take", "this cures", "instead of your medication")
 *   - NO dosing or self-diagnosis prompts
 *   - NO discouraging professional care
 *   - Standard disclaimer required on educational content
 *
 * Two-tier severity:
 *   - 'block' — hard violation. Render must not publish. Examples: explicit
 *     medical claims, anti-medication framing, diagnosis prompts.
 *   - 'warn'  — soft violation. Render proceeds but admin sees an inline flag.
 *     Examples: borderline phrases that might be benign in context but warrant
 *     a human read.
 *
 * Designed to be conservative on the block side. False positives are fine;
 * false negatives are brand-safety incidents.
 */

export type ComplianceSeverity = 'block' | 'warn';

export interface ComplianceFinding {
  severity: ComplianceSeverity;
  phrase: string;       // the matched phrase (lowercased)
  reason: string;       // why this is a problem
  start: number;        // char offset in the input
  end: number;
}

export interface ComplianceResult {
  passed: boolean;       // true when no 'block' findings
  blocked: boolean;      // true when any 'block' finding present
  findings: ComplianceFinding[];
  /** Convenience: the input with each finding wrapped in **bold** markers. Useful for admin preview. */
  highlightedText: string;
}

// ---------------------------------------------------------------------------
// Rule banks
// ---------------------------------------------------------------------------

interface Rule {
  pattern: RegExp;
  severity: ComplianceSeverity;
  reason: string;
}

/**
 * BLOCK-tier patterns. These represent explicit medical advice or
 * anti-care framing. Render must not publish if any of these fire.
 *
 * Each pattern is case-insensitive and matches with word boundaries where
 * relevant. Phrases are conservative — if a real Zebby script wants to say
 * something close to this, we'd rather catch it and let a human approve.
 */
const BLOCK_RULES: Rule[] = [
  // Direct prescriptive claims
  { pattern: /\b(this|it|zebby)\s+(cures?|heals?|treats?)\s+(your|the)?\s*(eds|pots|chronic|illness|disease|condition|symptoms?)\b/i, severity: 'block', reason: 'Implies a cure or treatment claim — Zebby content cannot make medical efficacy claims.' },
  { pattern: /\bguaranteed?\s+(cure|relief|fix)\b/i, severity: 'block', reason: 'Promises a medical outcome.' },
  { pattern: /\byou\s+should\s+take\s+\w+/i, severity: 'block', reason: 'Direct medication recommendation.' },
  { pattern: /\b(stop|skip|don'?t take|avoid)\s+(your|the)?\s*(medication|meds|prescription|treatment)\b/i, severity: 'block', reason: 'Discourages medication adherence — a hard brand-safety line.' },
  { pattern: /\binstead\s+of\s+(seeing|going to|talking to|your)?\s*(a |the )?(doctor|physician|specialist|pcp|rheumatologist|cardiologist|neurologist)\b/i, severity: 'block', reason: 'Positions content as an alternative to professional medical care.' },
  { pattern: /\byou\s+(have|might have|probably have)\s+(eds|pots|hypermobility|dysautonomia)\b/i, severity: 'block', reason: 'Diagnoses the viewer — Zebby content cannot diagnose.' },
  { pattern: /\bdiagnose\s+yourself\b/i, severity: 'block', reason: 'Encourages self-diagnosis.' },
  { pattern: /\bdosage\s+(of|for)\b/i, severity: 'block', reason: 'Dosing guidance is medical advice.' },
  { pattern: /\bmilligrams?\s+(of|per)\b/i, severity: 'block', reason: 'Dosing-specific language — Zebby content stays free of medication dosing.' },

  // Anti-care framing
  { pattern: /\bdoctors?\s+(don'?t|won'?t|can'?t)\s+help\b/i, severity: 'block', reason: 'Undermines professional care.' },
  { pattern: /\bbig pharma\b/i, severity: 'block', reason: 'Conspiratorial framing inconsistent with Zebby brand voice.' },
];

/**
 * WARN-tier patterns. Likely-benign phrases that a human should glance at
 * before publishing. Render proceeds; admin UI surfaces the flag inline.
 */
const WARN_RULES: Rule[] = [
  { pattern: /\b(my|i)\s+(used|stopped|switched|tried)\s+(taking|using)\s+\w+/i, severity: 'warn', reason: 'First-person medication story — review for implicit recommendation.' },
  { pattern: /\bworks?\s+(better|best)\s+than\b/i, severity: 'warn', reason: 'Comparative efficacy claim — check context.' },
  { pattern: /\b(supplement|herb|essential oil|cbd|kratom|mushroom)s?\s+(for|cure|help|treat)/i, severity: 'warn', reason: 'Supplement/herbal claim — high regulatory risk on health platforms.' },
  { pattern: /\b(natural|holistic|alternative)\s+(cure|treatment|remedy)\b/i, severity: 'warn', reason: 'Alternative-medicine framing — review for medical-advice line.' },
  { pattern: /\bmiracle\b/i, severity: 'warn', reason: '"Miracle" language commonly flags TikTok/IG health-content moderators.' },
  { pattern: /\bdetox\b/i, severity: 'warn', reason: '"Detox" is a high-risk word on platform health-content filters.' },
  { pattern: /\bweight loss\b/i, severity: 'warn', reason: 'Weight-loss framing is platform-restricted and off-brand for Zebby.' },
  { pattern: /\b(suicide|self-?harm|kill myself)\b/i, severity: 'warn', reason: 'Sensitive mental-health language — surface for human review before publish.' },
];

const ALL_RULES: Rule[] = [...BLOCK_RULES, ...WARN_RULES];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lint a single string (caption, CTA copy, post body). Returns findings + a
 * highlighted version of the text suitable for admin preview.
 */
export function lintZebbyText(text: string): ComplianceResult {
  if (!text || !text.trim()) {
    return { passed: true, blocked: false, findings: [], highlightedText: text };
  }

  const findings: ComplianceFinding[] = [];

  for (const rule of ALL_RULES) {
    // Use global+case-insensitive variant per match attempt.
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      findings.push({
        severity: rule.severity,
        phrase: m[0].toLowerCase(),
        reason: rule.reason,
        start: m.index,
        end: m.index + m[0].length,
      });
      // Prevent infinite loop on zero-width matches.
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // Sort by char offset for stable highlighting.
  findings.sort((a, b) => a.start - b.start);

  const blocked = findings.some((f) => f.severity === 'block');
  const highlightedText = buildHighlight(text, findings);

  return {
    passed: !blocked,
    blocked,
    findings,
    highlightedText,
  };
}

/**
 * Lint multiple strings at once and aggregate. Useful for "lint everything
 * about this clip" — caption + hook + CTA + post body — and getting one
 * verdict back.
 */
export function lintZebbyBundle(
  parts: Record<string, string | null | undefined>,
): { passed: boolean; blocked: boolean; byField: Record<string, ComplianceResult> } {
  const byField: Record<string, ComplianceResult> = {};
  let blocked = false;
  for (const [key, val] of Object.entries(parts)) {
    if (!val) continue;
    const res = lintZebbyText(val);
    byField[key] = res;
    if (res.blocked) blocked = true;
  }
  return { passed: !blocked, blocked, byField };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHighlight(text: string, findings: ComplianceFinding[]): string {
  if (findings.length === 0) return text;

  // Walk the text, inserting **bold** markers around non-overlapping ranges.
  // For overlapping ranges (rare), keep the outermost.
  const ranges: Array<[number, number, ComplianceSeverity]> = [];
  for (const f of findings) {
    const last = ranges[ranges.length - 1];
    if (last && f.start < last[1]) continue; // skip overlap
    ranges.push([f.start, f.end, f.severity]);
  }

  const out: string[] = [];
  let cursor = 0;
  for (const [start, end, sev] of ranges) {
    out.push(text.slice(cursor, start));
    const marker = sev === 'block' ? '🚫' : '⚠️';
    out.push(`**${marker}${text.slice(start, end)}**`);
    cursor = end;
  }
  out.push(text.slice(cursor));
  return out.join('');
}
