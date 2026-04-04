/**
 * Script Anti-Cliche Layer
 *
 * Provides:
 * 1. Banned phrase/pattern lists for prompt injection
 * 2. Post-generation heuristic checks on script text
 *
 * All checks are fast, deterministic, no AI calls.
 */

// ---------------------------------------------------------------------------
// Banned phrases — injected into the generation prompt
// ---------------------------------------------------------------------------

export const SCRIPT_BANNED_PHRASES = [
  // AI marketing voice
  'game changer', 'changed my life', 'transform your',
  'revolutionize', 'elevate your', 'unlock the secret',
  'discover the power', 'say goodbye to', 'say hello to',
  'the ultimate', 'next level', 'best thing ever',
  'you won\'t believe', 'mind blown', 'holy grail',
  'must have', 'you need this', 'trust me',
  'i\'m obsessed', 'literally obsessed', 'run don\'t walk',
  'thank me later', 'you\'re welcome', 'hidden gem',
  'best kept secret', 'insider secret',

  // Fake casual that still sounds AI
  'let me put you on', 'let me put you guys on',
  'i need to tell you something', 'can we talk about',
  'we need to talk about', 'stop what you\'re doing',
  'drop everything', 'hear me out',

  // Overused transitions
  'but here\'s the twist', 'but here\'s the thing',
  'and here\'s why', 'and that\'s not all',
  'but wait there\'s more', 'and the best part is',
  'and the crazy part is', 'fast forward to today',
  'long story short', 'spoiler alert',

  // Generic closers
  'what are you waiting for', 'don\'t miss out',
  'act now', 'limited time', 'while supplies last',
  'you won\'t regret it', 'your future self will thank you',
];

// ---------------------------------------------------------------------------
// Banned sentence patterns (regex) — for prompt and post-gen checks
// ---------------------------------------------------------------------------

export const SCRIPT_BANNED_PATTERNS = [
  // "Imagine X. Now imagine Y." AI structure
  /imagine\b.*\.\s*now imagine\b/i,
  // "What if I told you" matrix speak
  /what if i told you/i,
  // "In a world where..." movie trailer
  /^in a world where/im,
  // "Tired of X? Meet/Try/Introducing Y" ad formula
  /tired of .+\?\s*(meet|try|introducing|discover|say hello)/i,
  // "Introducing the..." product launch
  /introducing the\b/i,
  // "The truth about..." overused framing
  /^the truth about\b/im,
  // Triple colon/dash list structure (AI loves these)
  /\b\w+:\s*\w+\.\s*\w+:\s*\w+\.\s*\w+:\s*\w+\./i,
  // "Not just X, but Y" parallel structure overuse
  /not just\s+\w+[\w\s]*,\s*but\s+(also\s+)?/i,
  // "Whether you're X or Y, this..." catch-all targeting
  /whether you'?re?\b.*\bor\b.*,\s*this\b/i,
];

// ---------------------------------------------------------------------------
// Build the anti-cliche prompt section
// ---------------------------------------------------------------------------

export function buildAntiClichePrompt(): string {
  const topBanned = SCRIPT_BANNED_PHRASES.slice(0, 30);

  return [
    '=== ANTI-CLICHE RULES (CRITICAL) ===',
    '',
    'BANNED PHRASES — NEVER use any of these:',
    topBanned.map(p => `"${p}"`).join(', '),
    '',
    'BANNED PATTERNS:',
    '- Do NOT use "Imagine X. Now imagine Y." structure',
    '- Do NOT use "What if I told you..." framing',
    '- Do NOT use "Tired of X? Meet Y." ad formula',
    '- Do NOT use "Not just X, but also Y" parallel constructions',
    '- Do NOT use "Whether you\'re X or Y, this..." catch-all targeting',
    '- Do NOT use triple-item lists with colons (AI loves these, humans don\'t talk this way)',
    '',
    'BANNED TRANSITIONS:',
    '- "but here\'s the twist" / "but here\'s the thing" / "and here\'s why"',
    '- "and the best part is" / "and the crazy part is"',
    '- "spoiler alert" / "fast forward to today" / "long story short"',
    '',
    'WHAT TO DO INSTEAD:',
    '- Be specific. Replace abstract claims with concrete details, timelines, numbers',
    '- Be imperfect. Real people restart sentences, trail off, change direction',
    '- Be committed. Pick one angle and go hard. Don\'t hedge with "whether you\'re X or Y"',
    '- Use sentence fragments. "Three weeks. That\'s it." beats "After just three weeks of use..."',
    '- Sound like a text to your friend, not a pitch to a stranger',
    '===',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Post-generation quality check
// ---------------------------------------------------------------------------

export interface ScriptQualityIssue {
  field: string;
  issue: string;
  severity: 'warning' | 'fail';
}

/**
 * Check a generated script for quality issues.
 * Returns empty array if the script is clean.
 */
export function checkScriptQuality(script: {
  hook?: string;
  setup?: string;
  body?: string;
  cta?: string;
}): ScriptQualityIssue[] {
  const issues: ScriptQualityIssue[] = [];
  const fields = [
    { name: 'hook', text: script.hook || '' },
    { name: 'setup', text: script.setup || '' },
    { name: 'body', text: script.body || '' },
    { name: 'cta', text: script.cta || '' },
  ];

  for (const { name, text } of fields) {
    if (!text) continue;
    const lower = text.toLowerCase();

    // Check banned phrases
    for (const phrase of SCRIPT_BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({ field: name, issue: `Contains banned phrase: "${phrase}"`, severity: 'fail' });
        break; // One per field is enough
      }
    }

    // Check banned patterns
    for (const pattern of SCRIPT_BANNED_PATTERNS) {
      if (pattern.test(text)) {
        issues.push({ field: name, issue: `Matches banned pattern`, severity: 'warning' });
        break;
      }
    }
  }

  // Check: hook should not start with "I"
  if (script.hook && /^\s*I\s/i.test(script.hook)) {
    issues.push({ field: 'hook', issue: 'Hook starts with "I" — lead with product, question, or command instead', severity: 'warning' });
  }

  // Check: CTA should not be too long (over 20 words)
  if (script.cta) {
    const ctaWords = script.cta.split(/\s+/).length;
    if (ctaWords > 25) {
      issues.push({ field: 'cta', issue: `CTA is ${ctaWords} words — should be under 20 for impact`, severity: 'warning' });
    }
  }

  return issues;
}
