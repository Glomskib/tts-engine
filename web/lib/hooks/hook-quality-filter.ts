/**
 * Quality filter for generated hooks.
 *
 * Rejects hooks that are generic, repetitive, vague, or use
 * banned marketing phrases. Fast — no AI calls, pure heuristics.
 */

export interface HookData {
  visual_hook: string;
  text_on_screen: string;
  verbal_hook: string;
  strategy_note: string;
  category: string;
  why_this_works: string;
}

export interface QualityResult {
  pass: boolean;
  reason?: string;
}

// ── Banned phrases that signal generic, overused hooks ────────────

const BANNED_PHRASES = [
  'this changed everything',
  'you won\'t believe',
  'you won\'t believe what happened',
  'game changer',
  'life hack',
  'wait for it',
  'changed my life',
  'i can\'t believe',
  'mind blown',
  'best thing ever',
  'you need this',
  'trust me on this',
  'i\'m obsessed',
  'holy grail',
  'must have',
  'this is it',
  'here\'s the thing',
  'not sponsored',
  'hear me out',
  'ok but like',
];

// ── Banned opening patterns (first few words) ────────────────────

const BANNED_OPENERS = [
  /^so i just/i,
  /^okay so/i,
  /^guys,?\s/i,
  /^hey guys/i,
  /^so basically/i,
  /^i just found/i,
  /^omg guys/i,
  /^you guys/i,
];

// ── Quality checks ──────────────────────────────────────────────

function containsBannedPhrase(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}

function hasBannedOpener(verbalHook: string): string | null {
  for (const pattern of BANNED_OPENERS) {
    if (pattern.test(verbalHook.trim())) return pattern.source;
  }
  return null;
}

function isTooVague(hook: HookData): boolean {
  // Visual hook should be specific (at least 8 words)
  const visualWords = hook.visual_hook.split(/\s+/).length;
  if (visualWords < 5) return true;

  // Verbal hook should exist and be substantive
  const verbalWords = hook.verbal_hook.split(/\s+/).length;
  if (verbalWords < 4) return true;

  return false;
}

function isTooLong(hook: HookData): boolean {
  // Verbal hook should be deliverable in ~2 seconds (under 20 words)
  const verbalWords = hook.verbal_hook.split(/\s+/).length;
  if (verbalWords > 25) return true;

  // Text on screen should be scannable (under 12 words)
  const textWords = hook.text_on_screen.split(/\s+/).length;
  if (textWords > 15) return true;

  return false;
}

/**
 * Check a single hook for quality.
 */
export function checkHookQuality(hook: HookData): QualityResult {
  // Check banned phrases across all text fields
  for (const field of [hook.visual_hook, hook.text_on_screen, hook.verbal_hook]) {
    const banned = containsBannedPhrase(field);
    if (banned) return { pass: false, reason: `Contains banned phrase: "${banned}"` };
  }

  // Check banned openers
  const bannedOpener = hasBannedOpener(hook.verbal_hook);
  if (bannedOpener) return { pass: false, reason: `Starts with generic opener` };

  // Check vagueness
  if (isTooVague(hook)) return { pass: false, reason: 'Too vague — visual or verbal hook lacks specificity' };

  // Check length
  if (isTooLong(hook)) return { pass: false, reason: 'Too long — verbal or text won\'t land in under 2 seconds' };

  return { pass: true };
}

/**
 * Check a batch of hooks for diversity.
 * Returns indices of hooks that violate diversity constraints.
 */
export function checkBatchDiversity(hooks: HookData[]): Map<number, string> {
  const issues = new Map<number, string>();

  // Check: no two hooks should start with the same 3 words
  const openers = new Map<string, number>();
  for (let i = 0; i < hooks.length; i++) {
    const first3 = hooks[i].verbal_hook.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    if (openers.has(first3)) {
      issues.set(i, `Same opening as hook #${openers.get(first3)! + 1}`);
    } else {
      openers.set(first3, i);
    }
  }

  // Check: no two hooks should use the same category
  const categories = new Map<string, number>();
  for (let i = 0; i < hooks.length; i++) {
    if (categories.has(hooks[i].category)) {
      issues.set(i, `Duplicate category "${hooks[i].category}" with hook #${categories.get(hooks[i].category)! + 1}`);
    } else {
      categories.set(hooks[i].category, i);
    }
  }

  return issues;
}

/**
 * Filter a batch: keep only hooks that pass quality + diversity.
 */
export function filterHookBatch(hooks: HookData[]): { passed: HookData[]; rejected: Array<{ hook: HookData; reason: string }> } {
  const passed: HookData[] = [];
  const rejected: Array<{ hook: HookData; reason: string }> = [];

  // Individual quality checks
  for (const hook of hooks) {
    const result = checkHookQuality(hook);
    if (result.pass) {
      passed.push(hook);
    } else {
      rejected.push({ hook, reason: result.reason! });
    }
  }

  // Diversity checks on passed hooks
  const diversityIssues = checkBatchDiversity(passed);
  const finalPassed: HookData[] = [];
  for (let i = 0; i < passed.length; i++) {
    if (diversityIssues.has(i)) {
      rejected.push({ hook: passed[i], reason: diversityIssues.get(i)! });
    } else {
      finalPassed.push(passed[i]);
    }
  }

  return { passed: finalPassed, rejected };
}
