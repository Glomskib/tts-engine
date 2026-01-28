/**
 * Skit Post-Processor with Boundary Throttle (Risk Tiers)
 *
 * Provides deterministic sanitization and risk detection for AI-generated skits.
 * Enforces policy compliance for supplement/product advertising.
 */

export type RiskTier = "SAFE" | "BALANCED" | "SPICY";

export type RiskFlag =
  | "POLICY_WORD"
  | "GUARANTEE"
  | "DISEASE_TERM"
  | "MEDICAL_CLAIM"
  | "PERCENTAGE_CLAIM"
  | "ABSOLUTE_CLAIM"
  | "LENGTH_EXCEEDED";

export interface RiskAnalysis {
  score: number;
  flags: RiskFlag[];
  flagDetails: { flag: RiskFlag; term: string; context: string }[];
}

// Forbidden terms - hard block, case-insensitive substring match
const FORBIDDEN_TERMS: { term: string; flag: RiskFlag }[] = [
  // Medical/health claims
  { term: "cure", flag: "POLICY_WORD" },
  { term: "treat", flag: "MEDICAL_CLAIM" },
  { term: "heal", flag: "MEDICAL_CLAIM" },
  { term: "diagnose", flag: "MEDICAL_CLAIM" },
  { term: "disease", flag: "DISEASE_TERM" },
  { term: "prescription", flag: "MEDICAL_CLAIM" },
  { term: "clinically", flag: "MEDICAL_CLAIM" },
  // Guarantee language
  { term: "guaranteed", flag: "GUARANTEE" },
  { term: "guarantee", flag: "GUARANTEE" },
  { term: "100%", flag: "PERCENTAGE_CLAIM" },
  // Absolute claims
  { term: "always", flag: "ABSOLUTE_CLAIM" },
  { term: "never", flag: "ABSOLUTE_CLAIM" },
  // Mental health terms
  { term: "adhd", flag: "DISEASE_TERM" },
  { term: "depression", flag: "DISEASE_TERM" },
  { term: "anxiety", flag: "DISEASE_TERM" },
  { term: "pain relief", flag: "MEDICAL_CLAIM" },
];

// Replacement phrases for sanitization (deterministic mapping)
const SAFE_REPLACEMENTS: Record<string, string> = {
  "cure": "support",
  "treat": "help with",
  "heal": "support",
  "diagnose": "understand",
  "disease": "condition",
  "prescription": "formula",
  "clinically": "thoughtfully",
  "guaranteed": "designed to",
  "guarantee": "aim to",
  "100%": "fully",
  "always": "often",
  "never": "rarely",
  "adhd": "focus challenges",
  "depression": "mood",
  "anxiety": "stress",
  "pain relief": "comfort support",
};

// Max lengths by content type
const MAX_LENGTHS = {
  hook_line: 150,
  dialogue: 200,
  action: 150,
  on_screen_text: 50,
  cta_line: 100,
  cta_overlay: 40,
  b_roll_item: 80,
  overlay_item: 60,
};

// Risk thresholds by tier (if score exceeds, downgrade)
const RISK_THRESHOLDS: Record<RiskTier, number> = {
  SAFE: 0,      // No tolerance
  BALANCED: 10, // Minor issues tolerated
  SPICY: 25,    // More tolerance but still enforced
};

/**
 * Detect forbidden terms in text (case-insensitive)
 */
function findForbiddenTerms(text: string): { term: string; flag: RiskFlag }[] {
  const lower = text.toLowerCase();
  const found: { term: string; flag: RiskFlag }[] = [];

  for (const { term, flag } of FORBIDDEN_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      found.push({ term, flag });
    }
  }

  return found;
}

/**
 * Sanitize text by replacing forbidden terms with safe alternatives
 * Deterministic: same input always produces same output
 */
export function sanitizeText(text: string, maxLength?: number): string {
  if (!text) return "";

  let result = text;

  // Replace forbidden terms (case-insensitive, preserve case pattern)
  for (const [forbidden, replacement] of Object.entries(SAFE_REPLACEMENTS)) {
    const regex = new RegExp(forbidden, "gi");
    result = result.replace(regex, (match) => {
      // Preserve capitalization pattern
      if (match === match.toUpperCase()) {
        return replacement.toUpperCase();
      }
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Trim to max length if specified
  if (maxLength && result.length > maxLength) {
    result = result.slice(0, maxLength - 3) + "...";
  }

  return result.trim();
}

/**
 * Detect risk flags in text
 * Returns unique flags found
 */
export function detectRiskFlags(text: string): RiskFlag[] {
  const found = findForbiddenTerms(text);
  const flags = new Set<RiskFlag>();

  for (const { flag } of found) {
    flags.add(flag);
  }

  return Array.from(flags);
}

/**
 * Calculate numeric risk score for text
 * Higher score = more risk
 * Deterministic calculation
 */
export function scoreRisk(text: string): number {
  const found = findForbiddenTerms(text);

  // Base score: each forbidden term adds points
  let score = 0;

  const flagWeights: Record<RiskFlag, number> = {
    POLICY_WORD: 15,
    MEDICAL_CLAIM: 12,
    DISEASE_TERM: 10,
    GUARANTEE: 8,
    PERCENTAGE_CLAIM: 6,
    ABSOLUTE_CLAIM: 4,
    LENGTH_EXCEEDED: 2,
  };

  for (const { flag } of found) {
    score += flagWeights[flag] || 5;
  }

  return score;
}

/**
 * Full risk analysis of text content
 */
export function analyzeRisk(text: string): RiskAnalysis {
  const found = findForbiddenTerms(text);
  const flags = new Set<RiskFlag>();
  const flagDetails: { flag: RiskFlag; term: string; context: string }[] = [];

  for (const { term, flag } of found) {
    flags.add(flag);
    // Extract context around the term
    const lower = text.toLowerCase();
    const idx = lower.indexOf(term.toLowerCase());
    const start = Math.max(0, idx - 20);
    const end = Math.min(text.length, idx + term.length + 20);
    const context = text.slice(start, end);
    flagDetails.push({ flag, term, context });
  }

  return {
    score: scoreRisk(text),
    flags: Array.from(flags),
    flagDetails,
  };
}

/**
 * Skit beat structure
 */
export interface SkitBeat {
  t: string;
  action: string;
  dialogue?: string;
  on_screen_text?: string;
}

/**
 * Full skit structure
 */
export interface Skit {
  hook_line: string;
  beats: SkitBeat[];
  b_roll: string[];
  overlays: string[];
  cta_line: string;
  cta_overlay: string;
}

/**
 * Post-process result
 */
export interface SkitPostProcessResult {
  skit: Skit;
  originalTier: RiskTier;
  appliedTier: RiskTier;
  wasDowngraded: boolean;
  riskScore: number;
  riskFlags: RiskFlag[];
}

/**
 * Determine the tier to apply based on risk score
 */
function determineTier(requestedTier: RiskTier, riskScore: number): RiskTier {
  // Check if score exceeds threshold for requested tier
  if (riskScore > RISK_THRESHOLDS[requestedTier]) {
    // Downgrade progressively
    if (requestedTier === "SPICY") {
      if (riskScore > RISK_THRESHOLDS.BALANCED) {
        return "SAFE";
      }
      return "BALANCED";
    }
    if (requestedTier === "BALANCED") {
      return "SAFE";
    }
  }
  return requestedTier;
}

/**
 * Sanitize entire skit structure
 */
function sanitizeSkit(skit: Skit): Skit {
  return {
    hook_line: sanitizeText(skit.hook_line, MAX_LENGTHS.hook_line),
    beats: skit.beats.map((beat) => ({
      t: beat.t,
      action: sanitizeText(beat.action, MAX_LENGTHS.action),
      dialogue: beat.dialogue ? sanitizeText(beat.dialogue, MAX_LENGTHS.dialogue) : undefined,
      on_screen_text: beat.on_screen_text ? sanitizeText(beat.on_screen_text, MAX_LENGTHS.on_screen_text) : undefined,
    })),
    b_roll: skit.b_roll.map((item) => sanitizeText(item, MAX_LENGTHS.b_roll_item)),
    overlays: skit.overlays.map((item) => sanitizeText(item, MAX_LENGTHS.overlay_item)),
    cta_line: sanitizeText(skit.cta_line, MAX_LENGTHS.cta_line),
    cta_overlay: sanitizeText(skit.cta_overlay, MAX_LENGTHS.cta_overlay),
  };
}

/**
 * Calculate total risk score for entire skit
 */
function calculateSkitRiskScore(skit: Skit): number {
  let total = 0;

  total += scoreRisk(skit.hook_line);
  total += scoreRisk(skit.cta_line);
  total += scoreRisk(skit.cta_overlay);

  for (const beat of skit.beats) {
    total += scoreRisk(beat.action);
    if (beat.dialogue) total += scoreRisk(beat.dialogue);
    if (beat.on_screen_text) total += scoreRisk(beat.on_screen_text);
  }

  for (const item of skit.b_roll) {
    total += scoreRisk(item);
  }

  for (const item of skit.overlays) {
    total += scoreRisk(item);
  }

  return total;
}

/**
 * Collect all risk flags from entire skit
 */
function collectSkitRiskFlags(skit: Skit): RiskFlag[] {
  const allFlags = new Set<RiskFlag>();

  const addFlags = (text: string) => {
    for (const flag of detectRiskFlags(text)) {
      allFlags.add(flag);
    }
  };

  addFlags(skit.hook_line);
  addFlags(skit.cta_line);
  addFlags(skit.cta_overlay);

  for (const beat of skit.beats) {
    addFlags(beat.action);
    if (beat.dialogue) addFlags(beat.dialogue);
    if (beat.on_screen_text) addFlags(beat.on_screen_text);
  }

  for (const item of skit.b_roll) {
    addFlags(item);
  }

  for (const item of skit.overlays) {
    addFlags(item);
  }

  return Array.from(allFlags);
}

/**
 * Main post-processor: sanitize skit and enforce tier compliance
 *
 * If risk score exceeds threshold for requested tier:
 * 1. Downgrade tier (SPICY -> BALANCED -> SAFE)
 * 2. Sanitize all text to remove forbidden terms
 * 3. Return flags and final tier in result
 *
 * Deterministic: same input always produces same output
 */
export function postProcessSkit(
  rawSkit: Skit,
  requestedTier: RiskTier
): SkitPostProcessResult {
  // Calculate risk score BEFORE sanitization
  const originalRiskScore = calculateSkitRiskScore(rawSkit);
  const originalFlags = collectSkitRiskFlags(rawSkit);

  // Determine if we need to downgrade
  const appliedTier = determineTier(requestedTier, originalRiskScore);
  const wasDowngraded = appliedTier !== requestedTier;

  // Always sanitize to ensure compliance
  const sanitizedSkit = sanitizeSkit(rawSkit);

  // Calculate final risk score (should be 0 after sanitization)
  const finalRiskScore = calculateSkitRiskScore(sanitizedSkit);
  const finalFlags = collectSkitRiskFlags(sanitizedSkit);

  return {
    skit: sanitizedSkit,
    originalTier: requestedTier,
    appliedTier,
    wasDowngraded,
    // Return the higher of original or final score for transparency
    riskScore: Math.max(originalRiskScore, finalRiskScore),
    // Return flags that were found (even if sanitized)
    riskFlags: originalFlags.length > 0 ? originalFlags : finalFlags,
  };
}

/**
 * Validate skit structure has required fields
 */
export function validateSkitStructure(obj: unknown): obj is Skit {
  if (!obj || typeof obj !== "object") return false;

  const skit = obj as Record<string, unknown>;

  if (typeof skit.hook_line !== "string") return false;
  if (!Array.isArray(skit.beats)) return false;
  if (!Array.isArray(skit.b_roll)) return false;
  if (!Array.isArray(skit.overlays)) return false;
  if (typeof skit.cta_line !== "string") return false;
  if (typeof skit.cta_overlay !== "string") return false;

  // Validate beats
  for (const beat of skit.beats) {
    if (!beat || typeof beat !== "object") return false;
    const b = beat as Record<string, unknown>;
    if (typeof b.t !== "string") return false;
    if (typeof b.action !== "string") return false;
    if (b.dialogue !== undefined && typeof b.dialogue !== "string") return false;
    if (b.on_screen_text !== undefined && typeof b.on_screen_text !== "string") return false;
  }

  return true;
}
