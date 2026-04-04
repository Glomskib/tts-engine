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
  // Original set
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
  // AI-speak / marketing
  'transform your',
  'revolutionize',
  'elevate your',
  'unlock the secret',
  'discover the power',
  'say goodbye to',
  'say hello to',
  'the secret to',
  'the ultimate',
  'next level',
  'total game changer',
  'absolute game changer',
  'literally obsessed',
  'low key obsessed',
  'not gonna lie',
  'i\'m not even kidding',
  'i literally can\'t',
  'this is the one',
  'the one thing',
  'if you know you know',
  'iykyk',
  // Generic filler
  'let me tell you',
  'i need to tell you',
  'can we talk about',
  'we need to talk about',
  'nobody talks about',
  'nobody is talking about this',
  'stop what you\'re doing',
  'drop everything',
  'run don\'t walk',
  'you\'re welcome',
  'thank me later',
  'best kept secret',
  'industry secret',
  'insider secret',
  'little known',
  'hidden gem',
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
  // Additional generic openers
  /^let me show you/i,
  /^i have to share/i,
  /^can i be honest/i,
  /^real talk/i,
  /^storytime/i,
  /^story time/i,
  /^pov:/i,
  /^attention[\s:!]/i,
  /^breaking[\s:!]/i,
  /^unpopular opinion/i,
  /^hot take/i,
  /^controversial opinion/i,
];

// ── Banned transitions / connectors ──────────────────────────────

const BANNED_TRANSITIONS = [
  'but here\'s the twist',
  'but here\'s the thing',
  'and here\'s why',
  'and that\'s not all',
  'but wait there\'s more',
  'and the best part is',
  'and the crazy part is',
  'and the wild part is',
  'fast forward to today',
  'long story short',
];

// ── AI-style patterns (regex) ────────────────────────────────────
// These detect hooks that are "too polished" or follow AI writing patterns

const AI_STYLE_PATTERNS = [
  // Symmetrical "X meets Y" or "X but make it Y" structure
  /\bbut make it\b/i,
  // "Imagine [X]. Now imagine [Y]." structure
  /^imagine\b.*\.\s*now imagine\b/i,
  // "What if I told you" matrix-speak
  /what if i told you/i,
  // Triple adjective stacking: "the quick, easy, and affordable"
  /\bthe\s+\w+,\s+\w+,\s+and\s+\w+\b/i,
  // "In a world where..." movie trailer speak
  /^in a world where/i,
  // Rhetorical question + immediate answer: "Tired of X? Meet Y."
  /tired of .+\?\s*(meet|try|introducing|discover|say hello)/i,
  // "Introducing the" product launch speak
  /^introducing\s+the\b/i,
  // "Here's why [number]" listicle opener
  /^here'?s why \d/i,
  // "The truth about" overused framing
  /^the truth about\b/i,
];

// ── Quality checks ──────────────────────────────────────────────

function containsBannedPhrase(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  for (const phrase of BANNED_TRANSITIONS) {
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

function hasAIStylePattern(hook: HookData): string | null {
  const allText = `${hook.visual_hook} ${hook.text_on_screen} ${hook.verbal_hook}`;
  for (const pattern of AI_STYLE_PATTERNS) {
    if (pattern.test(allText)) return pattern.source;
  }
  return null;
}

function isTooVague(hook: HookData): boolean {
  const visualWords = hook.visual_hook.split(/\s+/).length;
  if (visualWords < 5) return true;

  const verbalWords = hook.verbal_hook.split(/\s+/).length;
  if (verbalWords < 4) return true;

  // Visual hook should contain at least one concrete noun or action
  // Flag purely abstract visuals
  const abstractVisuals = /^(person|someone|user|creator|influencer)\s+(holds?|shows?|displays?|presents?|uses?)\s+(the\s+)?product/i;
  if (abstractVisuals.test(hook.visual_hook.trim())) return true;

  return false;
}

function isTooLong(hook: HookData): boolean {
  const verbalWords = hook.verbal_hook.split(/\s+/).length;
  if (verbalWords > 25) return true;

  const textWords = hook.text_on_screen.split(/\s+/).length;
  if (textWords > 15) return true;

  return false;
}

function isRepetitiveStructure(hook: HookData): boolean {
  // Detect if verbal_hook and text_on_screen say essentially the same thing
  const verbalLower = hook.verbal_hook.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const textLower = hook.text_on_screen.toLowerCase().replace(/[^a-z0-9\s]/g, '');

  // If text on screen is a substring of verbal hook or vice versa (80%+ overlap)
  if (verbalLower.length > 10 && textLower.length > 10) {
    const verbalWords = new Set(verbalLower.split(/\s+/));
    const textWords = textLower.split(/\s+/);
    const overlap = textWords.filter(w => verbalWords.has(w)).length;
    if (overlap / textWords.length > 0.75) return true;
  }

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

  // Check AI-style patterns
  const aiPattern = hasAIStylePattern(hook);
  if (aiPattern) return { pass: false, reason: `Matches AI-style pattern` };

  // Check vagueness
  if (isTooVague(hook)) return { pass: false, reason: 'Too vague — visual or verbal hook lacks specificity' };

  // Check length
  if (isTooLong(hook)) return { pass: false, reason: 'Too long — verbal or text won\'t land in under 2 seconds' };

  // Check repetitive structure (text ≈ verbal)
  if (isRepetitiveStructure(hook)) return { pass: false, reason: 'Text on screen repeats the verbal hook — should create independent tension' };

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

  // Check: no two text_on_screen should share 50%+ of their words
  for (let i = 0; i < hooks.length; i++) {
    if (issues.has(i)) continue;
    const iWords = new Set(hooks[i].text_on_screen.toLowerCase().split(/\s+/));
    for (let j = i + 1; j < hooks.length; j++) {
      if (issues.has(j)) continue;
      const jWords = hooks[j].text_on_screen.toLowerCase().split(/\s+/);
      const overlap = jWords.filter(w => iWords.has(w)).length;
      if (jWords.length > 3 && overlap / jWords.length > 0.5) {
        issues.set(j, `Text on screen too similar to hook #${i + 1}`);
      }
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
