/**
 * compliance-linter.ts
 *
 * Server-side compliance preflight for TikTok content.
 * Checks script and caption against policy packs to prevent violations.
 *
 * Supports "masked words" strategy: flags terms but suggests mask variants.
 */

// ============================================================================
// Types
// ============================================================================

export type ComplianceSeverity = "ok" | "warn" | "block";

export interface ComplianceIssue {
  code: string;
  message: string;
  matched_term: string;
  field: "script_text" | "caption" | "hashtags";
  severity: "warn" | "block";
  suggestion?: string;
}

export interface ComplianceLintResult {
  severity: ComplianceSeverity;
  issues: ComplianceIssue[];
  policy_pack: string;
  checked_at: string;
}

export type PolicyPack = "supplements" | "generic";

// ============================================================================
// Policy Definitions
// ============================================================================

interface PolicyRule {
  pattern: RegExp;
  code: string;
  message: string;
  severity: "warn" | "block";
  suggestion?: string;
}

/**
 * Supplements policy pack - stricter rules for dietary supplements.
 * TikTok has specific restrictions on health claims and supplement marketing.
 */
const SUPPLEMENTS_RULES: PolicyRule[] = [
  // Blocked medical claims
  {
    pattern: /\b(cure[sd]?|cures?|curing)\b/gi,
    code: "MEDICAL_CLAIM_CURE",
    message: "Medical cure claims are prohibited",
    severity: "block",
  },
  {
    pattern: /\b(treat[sd]?|treats?|treating|treatment)\s+(disease|illness|condition|disorder)/gi,
    code: "MEDICAL_CLAIM_TREAT",
    message: "Disease treatment claims are prohibited",
    severity: "block",
  },
  {
    pattern: /\b(diagnos[ei]s?|diagnose[sd]?)\b/gi,
    code: "MEDICAL_CLAIM_DIAGNOSE",
    message: "Diagnostic claims are prohibited",
    severity: "block",
  },
  {
    pattern: /\b(FDA\s+approved|clinically\s+proven)\b/gi,
    code: "UNVERIFIED_CLAIM",
    message: "Unverified regulatory claims are prohibited",
    severity: "block",
  },
  {
    pattern: /\bguaranteed?\s+(results?|weight\s+loss|gains?)\b/gi,
    code: "GUARANTEED_RESULTS",
    message: "Guaranteed results claims are prohibited",
    severity: "block",
  },

  // Blocked weight loss claims
  {
    pattern: /\blose\s+\d+\s*(lbs?|pounds?|kg|kilos?)\b/gi,
    code: "SPECIFIC_WEIGHT_LOSS",
    message: "Specific weight loss claims are prohibited",
    severity: "block",
  },
  {
    pattern: /\b(burn\s+fat|fat\s+burn(er|ing)?|melt\s+(away\s+)?fat)\b/gi,
    code: "FAT_BURN_CLAIM",
    message: "Fat burning claims require careful wording",
    severity: "warn",
    suggestion: "Consider: 'supports metabolism' or 'energy support'",
  },

  // Masked words - suggest alternatives
  {
    pattern: /\bsteroids?\b/gi,
    code: "STEROID_MENTION",
    message: "Steroid references may trigger review",
    severity: "warn",
    suggestion: "Consider: 'performance support' or 'natural formula'",
  },
  {
    pattern: /\btestosterone\b/gi,
    code: "HORMONE_MENTION",
    message: "Direct hormone references may trigger review",
    severity: "warn",
    suggestion: "Consider: 'T-support' or 'male vitality'",
  },
  {
    pattern: /\bestrogen\b/gi,
    code: "HORMONE_MENTION",
    message: "Direct hormone references may trigger review",
    severity: "warn",
    suggestion: "Consider: 'hormone balance support'",
  },

  // Restricted health claims
  {
    pattern: /\b(anti[- ]?aging|reverse\s+aging)\b/gi,
    code: "ANTI_AGING_CLAIM",
    message: "Anti-aging claims may be restricted",
    severity: "warn",
    suggestion: "Consider: 'supports healthy aging' or 'vitality support'",
  },
  {
    pattern: /\b(miracle|magic|secret\s+formula)\b/gi,
    code: "MIRACLE_CLAIM",
    message: "Exaggerated claims are prohibited",
    severity: "block",
  },

  // Before/after implications
  {
    pattern: /\b(before\s+and\s+after|transformation)\b/gi,
    code: "BEFORE_AFTER",
    message: "Before/after content may require disclaimers",
    severity: "warn",
    suggestion: "Add disclaimer: 'Results may vary. Not typical.'",
  },
];

/**
 * Generic policy pack - baseline rules for all content.
 */
const GENERIC_RULES: PolicyRule[] = [
  // Profanity (blocked)
  {
    pattern: /\b(fuck|shit|damn|ass|bitch)\b/gi,
    code: "PROFANITY",
    message: "Profanity is not allowed",
    severity: "block",
  },

  // Spam indicators
  {
    pattern: /\b(click\s+(the\s+)?link\s+in\s+bio|link\s+in\s+bio|linkinbio)\b/gi,
    code: "LINK_IN_BIO_SPAM",
    message: "Excessive link-in-bio references may reduce reach",
    severity: "warn",
  },
  {
    pattern: /(!!!|\?\?\?|\.\.\.\.+)/g,
    code: "EXCESSIVE_PUNCTUATION",
    message: "Excessive punctuation may appear spammy",
    severity: "warn",
  },

  // Engagement bait
  {
    pattern: /\b(follow\s+for\s+follow|f4f|like\s+for\s+like|l4l)\b/gi,
    code: "ENGAGEMENT_BAIT",
    message: "Engagement bait may reduce distribution",
    severity: "warn",
  },

  // Hashtag spam (checked separately for hashtags field)
  {
    pattern: /#\w+\s*#\w+\s*#\w+\s*#\w+\s*#\w+\s*#\w+\s*#\w+\s*#\w+\s*#\w+\s*#\w+/gi,
    code: "HASHTAG_SPAM",
    message: "Too many hashtags (10+) may reduce reach",
    severity: "warn",
    suggestion: "Use 3-5 relevant hashtags for best performance",
  },

  // Misleading claims
  {
    pattern: /\b(100%\s+guaranteed|money\s+back|risk\s+free)\b/gi,
    code: "MISLEADING_GUARANTEE",
    message: "Guarantee claims should be accurate and verifiable",
    severity: "warn",
  },

  // Urgency manipulation
  {
    pattern: /\b(act\s+now|limited\s+time|only\s+\d+\s+left|selling\s+out)\b/gi,
    code: "FALSE_URGENCY",
    message: "False urgency claims may violate policies",
    severity: "warn",
  },
];

// Policy pack registry
const POLICY_PACKS: Record<PolicyPack, PolicyRule[]> = {
  supplements: [...GENERIC_RULES, ...SUPPLEMENTS_RULES],
  generic: GENERIC_RULES,
};

// ============================================================================
// Linting Functions
// ============================================================================

/**
 * Lint content against a single rule.
 */
function checkRule(
  content: string,
  field: ComplianceIssue["field"],
  rule: PolicyRule
): ComplianceIssue | null {
  const match = content.match(rule.pattern);
  if (!match) return null;

  return {
    code: rule.code,
    message: rule.message,
    matched_term: match[0],
    field,
    severity: rule.severity,
    suggestion: rule.suggestion,
  };
}

/**
 * Lint script text, caption, and hashtags against policy pack.
 *
 * @param params - Content to lint
 * @param params.script_text - Main script/spoken content
 * @param params.caption - Post caption
 * @param params.hashtags - Array of hashtags (without #)
 * @param params.policy_pack - Which policy pack to use (default: "generic")
 * @returns Lint result with severity and issues
 */
export function lintScriptAndCaption(params: {
  script_text?: string | null;
  caption?: string | null;
  hashtags?: string[] | null;
  policy_pack?: PolicyPack;
}): ComplianceLintResult {
  const policyPack = params.policy_pack || "generic";
  const rules = POLICY_PACKS[policyPack] || GENERIC_RULES;
  const issues: ComplianceIssue[] = [];

  // Check script_text
  if (params.script_text) {
    for (const rule of rules) {
      const issue = checkRule(params.script_text, "script_text", rule);
      if (issue) {
        issues.push(issue);
      }
    }
  }

  // Check caption
  if (params.caption) {
    for (const rule of rules) {
      const issue = checkRule(params.caption, "caption", rule);
      if (issue) {
        // Don't duplicate issues found in both fields with same term
        const isDuplicate = issues.some(
          (i) => i.code === issue.code && i.matched_term === issue.matched_term
        );
        if (!isDuplicate) {
          issues.push(issue);
        }
      }
    }
  }

  // Check hashtags (join and check as string)
  if (params.hashtags && params.hashtags.length > 0) {
    const hashtagsStr = params.hashtags.map((h) => `#${h}`).join(" ");

    // Check for too many hashtags
    if (params.hashtags.length > 10) {
      issues.push({
        code: "HASHTAG_COUNT",
        message: `Too many hashtags (${params.hashtags.length}). TikTok recommends 3-5.`,
        matched_term: `${params.hashtags.length} hashtags`,
        field: "hashtags",
        severity: "warn",
        suggestion: "Use 3-5 relevant hashtags for best performance",
      });
    }

    // Check hashtag content against rules
    for (const rule of rules) {
      const issue = checkRule(hashtagsStr, "hashtags", rule);
      if (issue) {
        issues.push(issue);
      }
    }
  }

  // Determine overall severity
  let severity: ComplianceSeverity = "ok";
  if (issues.some((i) => i.severity === "block")) {
    severity = "block";
  } else if (issues.some((i) => i.severity === "warn")) {
    severity = "warn";
  }

  return {
    severity,
    issues,
    policy_pack: policyPack,
    checked_at: new Date().toISOString(),
  };
}

/**
 * Get available policy packs.
 */
export function getAvailablePolicyPacks(): PolicyPack[] {
  return Object.keys(POLICY_PACKS) as PolicyPack[];
}

/**
 * Check if a policy pack exists.
 */
export function isValidPolicyPack(pack: string): pack is PolicyPack {
  return pack in POLICY_PACKS;
}
