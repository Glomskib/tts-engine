/**
 * Claim Risk Classifier — Scans post content for health claims,
 * unverified statistics, and regulatory red flags before publishing.
 *
 * Returns a risk score (0-100), flag list, and risk level.
 * Score < 30 = LOW  (auto-publish OK)
 * Score 30-69 = MED  (human approval required)
 * Score >= 70 = HIGH (do not publish)
 *
 * Supplement-specific hardening:
 *   - DISALLOWED_PHRASES → instant HIGH (blocked), weight 70+
 *   - REQUIRES_DISCLAIMER → forces MED (draft-only), weight 35
 */

import type { ClaimRiskResult } from './types';

interface RiskPattern {
  pattern: RegExp;
  flag: string;
  weight: number;
}

// ── Disallowed Phrases (force HIGH — auto-blocked) ──────────────
// These phrases must never appear in published marketing content.
// A single match pushes score to >= 70 (blocked).
const DISALLOWED_PHRASES: RiskPattern[] = [
  { pattern: /\b(cures?|cure[sd]?)\s+(cancer|diabetes|alzheimer'?s?|parkinson'?s?|epilepsy|autism|HIV|AIDS)\b/i, flag: 'blocklist_disease_cure', weight: 80 },
  { pattern: /\breplace\s+(your\s+)?medications?\b/i, flag: 'blocklist_replace_meds', weight: 70 },
  { pattern: /\bstop\s+taking\s+(your\s+)?(meds|medications?|prescriptions?)\b/i, flag: 'blocklist_stop_meds', weight: 80 },
  { pattern: /\bFDA[- ]approved\s+supplement\b/i, flag: 'blocklist_fda_supplement', weight: 70 },
  { pattern: /\b(miracle|magic)\s+(cure|pill|supplement|formula)\b/i, flag: 'blocklist_miracle', weight: 70 },
  { pattern: /\bscientifically\s+proven\s+to\s+(cure|treat|heal|reverse)\b/i, flag: 'blocklist_proven_cure', weight: 80 },
  { pattern: /\b(kills?|eliminates?|destroys?)\s+(cancer|tumor|virus)\s+cells?\b/i, flag: 'blocklist_kill_disease', weight: 80 },
  { pattern: /\bno\s+prescription\s+(needed|required)\b/i, flag: 'blocklist_no_rx', weight: 70 },
];

// ── Requires Disclaimer (force MED — draft-only, needs review) ──
// These topics are OK to discuss but require human review + disclaimer.
const REQUIRES_DISCLAIMER: RiskPattern[] = [
  { pattern: /\b(supplement|vitamin|mineral|probiotic|herb|herbal)\b.*\b(helps?|supports?|promotes?|may\s+(help|support|improve))\b/i, flag: 'disclaimer_supplement_benefit', weight: 35 },
  { pattern: /\b(CBD|THC|hemp|cannabis|kratom|kava)\b/i, flag: 'disclaimer_controlled_substance', weight: 35 },
  { pattern: /\b(testosterone|estrogen|hormone)\s+(boost|support|balance)\b/i, flag: 'disclaimer_hormone', weight: 35 },
  { pattern: /\b(blood\s+(sugar|pressure)|cholesterol|inflammation)\s+(support|management|control|reduce)\b/i, flag: 'disclaimer_medical_metric', weight: 35 },
  { pattern: /\b(pain\s+relief|relieves?\s+pain|reduces?\s+(pain|aches?))\b/i, flag: 'disclaimer_pain_claim', weight: 35 },
  { pattern: /\b(EDS|POTS|dysautonomia|ehlers[- ]danlos)\b.*\b(helps?|supports?|manages?|improves?)\b/i, flag: 'disclaimer_condition_benefit', weight: 35 },
];

// ── Standard Risk Patterns ──────────────────────────────────────
const RISK_PATTERNS: RiskPattern[] = [
  // Health claims
  { pattern: /\b(cures?|heals?|treats?|prevents?|reverses?)\b.*\b(disease|cancer|diabetes|illness|condition)\b/i, flag: 'health_claim_cure', weight: 40 },
  { pattern: /\bclinically\s+proven\b/i, flag: 'unverified_clinical', weight: 35 },
  { pattern: /\bFDA\s+(approved|cleared)\b/i, flag: 'fda_claim', weight: 30 },
  { pattern: /\bmedically\s+(proven|tested)\b/i, flag: 'medical_claim', weight: 35 },
  { pattern: /\bdoctor\s+recommended\b/i, flag: 'doctor_endorsement', weight: 25 },

  // Absolute guarantees
  { pattern: /\bguaranteed\s+(results?|to\s+work)\b/i, flag: 'guarantee_claim', weight: 30 },
  { pattern: /\b100%\s+(safe|effective|natural)\b/i, flag: 'absolute_claim', weight: 25 },
  { pattern: /\bno\s+side\s+effects?\b/i, flag: 'safety_claim', weight: 30 },
  { pattern: /\brisk[- ]free\b/i, flag: 'risk_free_claim', weight: 20 },

  // Unverified statistics
  { pattern: /\b\d+%\s+(of\s+(people|users|customers|patients)|more\s+effective)\b/i, flag: 'unverified_stat', weight: 20 },
  { pattern: /\bstudies?\s+show\b/i, flag: 'vague_study_reference', weight: 15 },

  // Financial claims
  { pattern: /\bmake\s+\$?\d+.*\b(per|a)\s+(day|week|month)\b/i, flag: 'income_claim', weight: 35 },
  { pattern: /\bget\s+rich\b/i, flag: 'get_rich_claim', weight: 30 },
  { pattern: /\bpassive\s+income\b/i, flag: 'passive_income_claim', weight: 15 },

  // Urgency/scarcity manipulation
  { pattern: /\b(only|just)\s+\d+\s+(left|remaining|spots?)\b/i, flag: 'artificial_scarcity', weight: 15 },
  { pattern: /\b(act|buy|order)\s+now\b.*\b(before|limited|expires?)\b/i, flag: 'urgency_pressure', weight: 10 },

  // Supplement-specific
  { pattern: /\b(detox|cleanse|flush)\s+(your|the)\s+(body|system|liver|kidneys?)\b/i, flag: 'detox_claim', weight: 25 },
  { pattern: /\bboost\s+(your\s+)?(immune|immunity)\b/i, flag: 'immunity_claim', weight: 20 },
  { pattern: /\banti[- ]?aging\b/i, flag: 'anti_aging_claim', weight: 15 },
  { pattern: /\bweight\s+loss\s+(guaranteed|fast|quick)\b/i, flag: 'weight_loss_claim', weight: 30 },
];

/** Claim risk level for API responses */
export type ClaimRiskLevel = 'LOW' | 'MED' | 'HIGH';

/**
 * Classify content for claim risk.
 * Pure function — no external dependencies.
 */
export function classifyClaimRisk(content: string): ClaimRiskResult {
  const flags: string[] = [];
  let totalWeight = 0;

  // 1. Check disallowed phrases first (instant HIGH)
  for (const { pattern, flag, weight } of DISALLOWED_PHRASES) {
    if (pattern.test(content)) {
      flags.push(flag);
      totalWeight += weight;
    }
  }

  // 2. Check disclaimer-required phrases (forces MED minimum)
  for (const { pattern, flag, weight } of REQUIRES_DISCLAIMER) {
    if (pattern.test(content)) {
      flags.push(flag);
      totalWeight += weight;
    }
  }

  // 3. Standard risk patterns
  for (const { pattern, flag, weight } of RISK_PATTERNS) {
    if (pattern.test(content)) {
      flags.push(flag);
      totalWeight += weight;
    }
  }

  // Cap at 100
  const score = Math.min(totalWeight, 100);

  const blocked = score >= 70;
  const needs_review = score >= 30 && score < 70;
  const safe = score < 30;

  return {
    score,
    flags,
    safe,
    needs_review,
    blocked,
    level: blocked ? 'HIGH' : needs_review ? 'MED' : 'LOW',
    requires_human_approval: needs_review || blocked,
  };
}
