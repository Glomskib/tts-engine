/**
 * Unified Script Generator
 *
 * Single module for ALL script generation across FlashFlow.
 * Replaces the two separate systems:
 *   - Path A: /api/scripts/generate (Haiku, random params, no persona context)
 *   - Path B: lib/script-expander.ts (Sonnet, persona + sales approach)
 *
 * Key improvements:
 *   1. Always uses Claude Sonnet for higher quality
 *   2. Always includes product info, audience persona, winner patterns, sales approach
 *   3. Intelligent variety biased toward proven patterns (not pure random)
 *   4. Scorer feedback fed into regeneration prompts
 *   5. Rich voice packs for persona differentiation
 *   6. Structure variety — not always hook→setup→body→cta
 *   7. Anti-cliche enforcement in prompt + post-generation check
 *   8. Optional punch-up pass for creator-native voice
 *
 * Called by:
 *   - /api/scripts/generate
 *   - /api/content-package/generate
 *   - /api/pipeline/auto-generate
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  PERSONAS,
  SALES_APPROACHES,
  pickPersona,
  pickSalesApproach,
} from '@/lib/script-expander';
import type { ScriptScoreResult } from '@/lib/script-scorer';
import { buildStylePack } from '@/lib/creator-style/style-pack';
import type { StylePack } from '@/lib/creator-style/style-pack';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import { buildVibePromptContext } from '@/lib/vibe-analysis/prompt-context';
import { getVoicePack, buildVoicePackPrompt } from '@/lib/script-voice-packs';
import { selectStructure, buildStructurePrompt } from '@/lib/script-structures';
import { buildAntiClichePrompt, checkScriptQuality } from '@/lib/script-anti-cliche';
import { fetchPerformanceContext } from '@/lib/creator-performance/build-prompt-context';
import { getGenerationKnowledgeContext } from '@/lib/knowledge-graph/retrieve';
import { punchUpScript } from '@/lib/script-punchup';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedScriptInput {
  /** Product ID — used to fetch product info, audience persona, winner patterns */
  productId?: string;

  /** Direct product info (used when productId isn't available) */
  productName?: string;
  productBrand?: string;
  productCategory?: string;
  productNotes?: string;
  productPainPoints?: string[];

  /** User ID — used to fetch winner_pattern_analyses */
  userId?: string;

  /** Hook text to build the script around */
  hookText?: string;

  /** Content type (e.g. "educational", "testimonial", "ugc_short") */
  contentType?: string;
  contentTypeName?: string;

  /** Audience persona ID — fetched from audience_personas table */
  audiencePersonaId?: string;

  /** Override persona selection (by ID from PERSONAS array) */
  personaId?: string;

  /** Override sales approach (by ID from SALES_APPROACHES array) */
  salesApproachId?: string;

  /** Already-used persona/approach IDs (for variety in batch generation) */
  usedPersonaIds?: string[];
  usedApproachIds?: string[];

  /** Style/compliance hints */
  categoryRisk?: string;

  /** Target length */
  targetLength?: '10_sec' | '15_sec' | '30_sec' | '45_sec' | '60_sec';

  /** Previous scorer feedback for regeneration */
  previousScore?: ScriptScoreResult;

  /** Caller context for prompt tuning */
  callerContext?: 'scripts_generate' | 'content_package' | 'pipeline' | 'other';

  /** Creator style fingerprint ID — injects style context into prompt */
  creatorStyleId?: string;

  /** Vibe analysis from a reference video — shapes rhythm, energy, pacing, CTA tone */
  vibeAnalysis?: import('@/lib/vibe-analysis/types').VibeAnalysis;

  /** Enable punch-up pass (default: true for pipeline, false otherwise) */
  enablePunchUp?: boolean;
}

export interface UnifiedScriptOutput {
  /** Full voiceover script */
  spokenScript: string;

  /** Hook line (first sentence) */
  hook: string;

  /** Setup section (problem/context) */
  setup: string;

  /** Body section (pitch/demo/story) */
  body: string;

  /** Call to action */
  cta: string;

  /** On-screen text overlays */
  onScreenText: string[];

  /** Social caption */
  caption: string;

  /** Hashtags */
  hashtags: string[];

  /** Filming/editing notes */
  filmingNotes: string;

  /** Which persona was used */
  persona: string;

  /** Which sales approach was used */
  salesApproach: string;

  /** Estimated video length */
  estimatedLength: string;

  /** Editor notes */
  editorNotes: string[];

  /** Creator style ID used (for traceability) */
  creatorStyleRef?: string;

  /** Script structure used */
  structureUsed?: string;

  /** Whether punch-up pass was applied */
  punchedUp?: boolean;
}

// ---------------------------------------------------------------------------
// Internal: Winner Pattern Analysis data
// ---------------------------------------------------------------------------

interface WinnerAnalysis {
  winningFormula: string | null;
  topHookTypes: Array<{ type: string; count: number; avg_views?: number; example?: string }>;
  commonPhrases: Array<{ phrase: string; count?: number; context?: string }>;
}

// ---------------------------------------------------------------------------
// Internal: Audience Persona data
// ---------------------------------------------------------------------------

interface AudiencePersonaData {
  name: string;
  description?: string;
  age_range?: string;
  gender?: string;
  lifestyle?: string;
  tone?: string;
  humor_style?: string;
  pain_points?: Array<{ point: string; intensity?: string; triggers?: string[] }>;
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  common_objections?: string[];
  content_they_engage_with?: string[];
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchProductInfo(productId: string) {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, name, brand, category, notes, pain_points')
    .eq('id', productId)
    .single();
  return data;
}

async function fetchWinnerPatternAnalysis(userId: string): Promise<WinnerAnalysis | null> {
  const { data } = await supabaseAdmin
    .from('winner_pattern_analyses')
    .select('winning_formula, top_hook_types, analysis')
    .eq('user_id', userId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  const analysis = (data.analysis || {}) as Record<string, unknown>;
  const rawPhrases = (analysis.common_phrases || []) as Array<string | { phrase: string; count?: number; context?: string }>;

  return {
    winningFormula: data.winning_formula || null,
    topHookTypes: (data.top_hook_types || []) as WinnerAnalysis['topHookTypes'],
    commonPhrases: rawPhrases.map((p) =>
      typeof p === 'string' ? { phrase: p } : p
    ),
  };
}

async function fetchAudiencePersona(personaId: string): Promise<AudiencePersonaData | null> {
  const { data } = await supabaseAdmin
    .from('audience_personas')
    .select(
      'name, description, age_range, gender, lifestyle, tone, humor_style, ' +
      'pain_points, phrases_they_use, phrases_to_avoid, common_objections, content_they_engage_with'
    )
    .eq('id', personaId)
    .single();
  return data as AudiencePersonaData | null;
}

async function fetchCreatorStyleContext(
  creatorStyleId: string
): Promise<{ promptContext: string; handle: string } | null> {
  const { data } = await supabaseAdmin
    .from('style_creators')
    .select('id, handle, platform, style_fingerprint')
    .eq('id', creatorStyleId)
    .single();

  if (!data) return null;

  // Use cached fingerprint if available
  const fingerprint = data.style_fingerprint as StylePack | null;
  if (fingerprint?.prompt_context) {
    return { promptContext: fingerprint.prompt_context, handle: data.handle };
  }

  // Fall back to rebuilding StylePack
  try {
    const pack = await buildStylePack(creatorStyleId);
    return { promptContext: pack.prompt_context, handle: data.handle };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildProductSection(input: {
  name: string;
  brand: string;
  category: string;
  notes: string;
  painPoints: string[];
}): string {
  const lines = [
    '=== PRODUCT ===',
    `Name: ${input.name}`,
    `Brand: ${input.brand}`,
    `Category: ${input.category || 'General'}`,
  ];
  if (input.notes) lines.push(`Notes: ${input.notes}`);
  if (input.painPoints.length > 0) {
    lines.push('Pain Points:');
    for (const p of input.painPoints) lines.push(`  - ${p}`);
  }
  return lines.join('\n');
}

function buildWinnerPatternsSection(analysis: WinnerAnalysis): string {
  const lines = ['=== WINNER INTELLIGENCE (from best-performing content) ==='];
  lines.push('Use these patterns to SHAPE your script — structure, rhythm, energy. Do NOT copy words.');

  if (analysis.winningFormula) {
    lines.push(`\nWinning Formula: ${analysis.winningFormula}`);
  }

  if (analysis.topHookTypes.length > 0) {
    lines.push('\nTop Hook Types (bias toward these proven styles):');
    for (const ht of analysis.topHookTypes.slice(0, 5)) {
      let line = `  - ${ht.type} (used ${ht.count}x`;
      if (ht.avg_views) line += `, avg ${ht.avg_views.toLocaleString()} views`;
      line += ')';
      if (ht.example) line += ` — e.g. "${ht.example}"`;
      lines.push(line);
    }
  }

  if (analysis.commonPhrases.length > 0) {
    lines.push('\nPhrases That Resonate (use sparingly, naturally):');
    for (const cp of analysis.commonPhrases.slice(0, 6)) {
      lines.push(`  - "${cp.phrase}"${cp.context ? ` — ${cp.context}` : ''}`);
    }
  }

  lines.push('===');
  return lines.join('\n');
}

function buildAudiencePersonaSection(persona: AudiencePersonaData): string {
  const lines = ['=== TARGET AUDIENCE ==='];
  lines.push(`Persona: ${persona.name}`);
  if (persona.description) lines.push(`Description: ${persona.description}`);
  if (persona.age_range) lines.push(`Age: ${persona.age_range}`);
  if (persona.gender) lines.push(`Gender: ${persona.gender}`);
  if (persona.lifestyle) lines.push(`Lifestyle: ${persona.lifestyle}`);
  if (persona.tone) lines.push(`Preferred Tone: ${persona.tone}`);

  if (persona.pain_points && persona.pain_points.length > 0) {
    lines.push('\nTheir Pain Points:');
    for (const pp of persona.pain_points.slice(0, 5)) {
      lines.push(`  - ${typeof pp === 'string' ? pp : pp.point}`);
    }
  }

  if (persona.phrases_they_use && persona.phrases_they_use.length > 0) {
    lines.push(`\nPhrases They Use: ${persona.phrases_they_use.slice(0, 8).join(', ')}`);
  }
  if (persona.phrases_to_avoid && persona.phrases_to_avoid.length > 0) {
    lines.push(`Phrases to AVOID: ${persona.phrases_to_avoid.slice(0, 5).join(', ')}`);
  }
  if (persona.common_objections && persona.common_objections.length > 0) {
    lines.push(`\nCommon Objections to Address: ${persona.common_objections.slice(0, 4).join(', ')}`);
  }

  lines.push('===');
  return lines.join('\n');
}

function buildScorerFeedbackSection(score: ScriptScoreResult): string {
  const lines = [
    '=== PREVIOUS ATTEMPT FEEDBACK (fix these issues) ===',
    `Score: ${score.totalScore}/10 (needs ${score.passed ? '' : 'improvement to reach '}7+)`,
  ];

  const { scores } = score;
  const weakest = Object.entries(scores).sort(([, a], [, b]) => a - b);
  lines.push('\nWeakest dimensions:');
  for (const [dim, val] of weakest.slice(0, 3)) {
    lines.push(`  - ${dim.replace(/_/g, ' ')}: ${val}/10`);
  }

  if (score.feedback) {
    lines.push(`\nFeedback: ${score.feedback}`);
  }

  if (score.suggestedImprovements.length > 0) {
    lines.push('\nRequired fixes:');
    for (const imp of score.suggestedImprovements) {
      lines.push(`  - ${imp}`);
    }
  }

  lines.push('\nAddress ALL of the above in this regeneration. The previous script was not good enough.');
  lines.push('===');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Word limits by target length
// ---------------------------------------------------------------------------

const WORD_LIMITS: Record<string, { max: number; chars: number; seconds: string }> = {
  '10_sec': { max: 50, chars: 250, seconds: '7-10' },
  '15_sec': { max: 70, chars: 350, seconds: '12-15' },
  '30_sec': { max: 120, chars: 600, seconds: '25-35' },
  '45_sec': { max: 160, chars: 800, seconds: '40-50' },
  '60_sec': { max: 200, chars: 1000, seconds: '50-65' },
};

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

export async function generateUnifiedScript(
  input: UnifiedScriptInput
): Promise<UnifiedScriptOutput> {
  // ── Resolve product info ──
  let productName = input.productName || '';
  let productBrand = input.productBrand || '';
  let productCategory = input.productCategory || '';
  let productNotes = input.productNotes || '';
  let painPoints = input.productPainPoints || [];

  if (input.productId) {
    const product = await fetchProductInfo(input.productId);
    if (product) {
      productName = productName || product.name;
      productBrand = productBrand || product.brand || '';
      productCategory = productCategory || product.category || '';
      productNotes = productNotes || product.notes || '';
      if (painPoints.length === 0 && Array.isArray(product.pain_points)) {
        painPoints = product.pain_points
          .map((pp: string | { point?: string }) =>
            typeof pp === 'string' ? pp : pp.point || ''
          )
          .filter(Boolean);
      }
    }
  }

  if (!productName) {
    throw new Error('Product name is required (provide productId or productName)');
  }

  // ── Fetch winner pattern analysis ──
  let winnerAnalysis: WinnerAnalysis | null = null;
  if (input.userId) {
    try {
      winnerAnalysis = await fetchWinnerPatternAnalysis(input.userId);
    } catch {
      // Non-fatal — proceed without winner intelligence
    }
  }

  // ── Fetch creator style context ──
  let creatorStyleContext: { promptContext: string; handle: string } | null = null;
  if (input.creatorStyleId) {
    try {
      creatorStyleContext = await fetchCreatorStyleContext(input.creatorStyleId);
    } catch {
      // Non-fatal — proceed without creator style
    }
  }

  // ── Fetch user style profile (from their own approved scripts) ──
  let userStyleProfile: string | null = null;
  if (input.userId) {
    try {
      const { data: profile } = await supabaseAdmin
        .from('ff_style_profiles')
        .select('prompt_context')
        .eq('user_id', input.userId)
        .single();
      if (profile?.prompt_context) {
        userStyleProfile = profile.prompt_context;
      }
    } catch {
      // Non-fatal — proceed without style profile
    }
  }

  // ── Fetch audience persona ──
  let audiencePersona: AudiencePersonaData | null = null;
  if (input.audiencePersonaId) {
    try {
      audiencePersona = await fetchAudiencePersona(input.audiencePersonaId);
    } catch {
      // Non-fatal
    }
  }

  // ── Pick persona (intelligent selection biased by winner patterns) ──
  let selectedPersona: (typeof PERSONAS)[number];
  if (input.personaId) {
    const found = PERSONAS.find((p) => p.id === input.personaId);
    selectedPersona = found || pickPersona(input.usedPersonaIds || []);
  } else {
    selectedPersona = pickPersona(input.usedPersonaIds || []);
  }

  // ── Get rich voice pack for the persona ──
  const voicePack = getVoicePack(selectedPersona.id);

  // ── Pick sales approach (biased by content type) ──
  let selectedApproach: (typeof SALES_APPROACHES)[number];
  if (input.salesApproachId) {
    const found = SALES_APPROACHES.find((a) => a.id === input.salesApproachId);
    selectedApproach = found || pickSalesApproach(input.contentType || '', input.usedApproachIds || []);
  } else {
    selectedApproach = pickSalesApproach(input.contentType || '', input.usedApproachIds || []);
  }

  // ── Select script structure based on persona + content type ──
  const structure = selectStructure(
    selectedPersona.id,
    input.contentType,
    voicePack.preferredStructures,
  );

  // ── Pick hook style (biased toward winner patterns) ──
  let hookStyleHint = '';
  if (winnerAnalysis && winnerAnalysis.topHookTypes.length > 0) {
    // Weight toward top hook types: 70% chance of using a proven style
    if (Math.random() < 0.7) {
      const topTypes = winnerAnalysis.topHookTypes.slice(0, 3);
      const picked = topTypes[Math.floor(Math.random() * topTypes.length)];
      hookStyleHint = `Use a "${picked.type}" hook style (proven to work for this user's audience)`;
      if (picked.example) hookStyleHint += ` — similar energy to: "${picked.example}"`;
    }
  }

  // ── Pick target length + word limit ──
  const targetLength = input.targetLength || '30_sec';
  const wordLimit = WORD_LIMITS[targetLength] || WORD_LIMITS['30_sec'];

  // ── Build the prompt ──
  const productSection = buildProductSection({
    name: productName,
    brand: productBrand,
    category: productCategory,
    notes: productNotes,
    painPoints,
  });

  const promptParts: string[] = [
    '=== SCRIPT GENERATION TASK ===',
    `Write a complete, filmable UGC short-form script for TikTok/Reels.`,
    '',
    productSection,
  ];

  // Hook
  if (input.hookText) {
    promptParts.push(`\n=== HOOK TO BUILD FROM ===\n"${input.hookText}"`);
  }
  if (hookStyleHint) {
    promptParts.push(`\n=== HOOK STYLE GUIDANCE ===\n${hookStyleHint}`);
  }

  // Content type
  if (input.contentType || input.contentTypeName) {
    promptParts.push(
      `\n=== CONTENT TYPE ===\n${input.contentTypeName || input.contentType}`
    );
  }

  // Rich voice pack (replaces thin persona one-liner)
  promptParts.push(`\n${buildVoicePackPrompt(voicePack)}`);

  // Sales approach
  promptParts.push(
    `\n=== SALES APPROACH ===\n${selectedApproach.name}: ${selectedApproach.description}`
  );

  // Script structure
  promptParts.push(`\n${buildStructurePrompt(structure)}`);

  // Audience persona
  if (audiencePersona) {
    promptParts.push(`\n${buildAudiencePersonaSection(audiencePersona)}`);
  }

  // Winner intelligence
  if (winnerAnalysis) {
    promptParts.push(`\n${buildWinnerPatternsSection(winnerAnalysis)}`);
  }

  // Creator style fingerprint
  if (creatorStyleContext) {
    promptParts.push(`\n${creatorStyleContext.promptContext}`);
  }

  // User style profile (from their own approved scripts)
  if (userStyleProfile) {
    promptParts.push(`\n${userStyleProfile}`);
  }

  // Creator performance profile (what hooks/angles/formats work best)
  if (input.userId) {
    try {
      const perfCtx = await fetchPerformanceContext(input.userId);
      if (perfCtx.hasData) {
        promptParts.push(`\n${perfCtx.prompt}`);
      }
    } catch {
      // Non-fatal — proceed without performance context
    }
  }

  // Creator knowledge graph (audience insights, product knowledge, patterns)
  if (input.userId) {
    try {
      const knowledgeCtx = await getGenerationKnowledgeContext(input.userId, productName || undefined);
      if (knowledgeCtx.hasData) {
        promptParts.push(`\n${knowledgeCtx.prompt}`);
      }
    } catch {
      // Non-fatal — proceed without knowledge context
    }
  }

  // Vibe analysis from reference video
  if (input.vibeAnalysis) {
    promptParts.push(`\n${buildVibePromptContext(input.vibeAnalysis)}`);
  }

  // Scorer feedback (for regeneration)
  if (input.previousScore) {
    promptParts.push(`\n${buildScorerFeedbackSection(input.previousScore)}`);
  }

  // Anti-cliche rules
  promptParts.push(`\n${buildAntiClichePrompt()}`);

  // Word limit
  promptParts.push(`
=== LENGTH CONSTRAINT (CRITICAL) ===
Target: ${wordLimit.seconds} seconds when read aloud (${wordLimit.max} words max / ~${wordLimit.chars} characters).
Scripts that are too long get cut off by TTS. Be CONCISE. Every word must earn its place.
`);

  // Category risk / compliance
  promptParts.push(`
=== COMPLIANCE RULES ===
Category: ${input.categoryRisk || productCategory || 'general'}
- For supplements: NO medical claims, avoid "cure", "treat", "diagnose", "guaranteed"
- Use conservative, compliant language. Focus on lifestyle benefits, not medical outcomes.
- The CTA must feel natural, not salesy.
`);

  // Voice rules
  promptParts.push(`
=== VOICE RULES ===
- Sound like the ${voicePack.name} persona above — match their rhythm, vocabulary, and attitude
- Never start the hook with "I" — lead with the product, a hook question, or a command
- Vary sentence length — short punchy fragments mixed with flowing ones
- Use the persona's natural fillers and vocabulary tendencies
- Include inline stage directions in brackets: [pause], [show product], [hold up bottle]
- Reference SPECIFIC product details — name, benefits, ingredients. No generic filler
- The CTA must match the persona's CTA style (see voice pack above)
- Text on screen should create independent tension, NOT repeat the verbal script
`);

  // Output format
  promptParts.push(`
=== OUTPUT FORMAT ===
Respond with ONLY a JSON object (no markdown, no code fences, no explanation):
{
  "hook": "${structure.fieldGuide.hook}",
  "setup": "${structure.fieldGuide.setup}",
  "body": "${structure.fieldGuide.body}",
  "cta": "${structure.fieldGuide.cta}",
  "on_screen_text": ["overlay 1", "overlay 2", "overlay 3"],
  "caption": "Complete social caption with emojis",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#fyp"],
  "filming_notes": "Practical filming guidance: angle, energy, props, setting",
  "editor_notes": ["Note 1", "Note 2"],
  "estimated_length": "${wordLimit.seconds} seconds"
}`);

  const fullPrompt = promptParts.join('\n');

  // ── Call Claude Sonnet ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const systemPrompt = `You are a UGC script writer for short-form video. You write scripts that sound like specific, real creators talking to their phone camera — never marketing copy, never AI-polished prose.

You have a specific persona voice to match. Stay in character. Match their rhythm, vocabulary, attitude, and CTA style exactly.

You follow a specific script structure. Each structure has a different narrative arc — use the arc you're given, not the default hook→setup→body→cta every time.

You NEVER use banned phrases or AI-style patterns. Your scripts are imperfect, specific, committed, and human. Fragments are fine. Sentence restarts are fine. Trailing off is fine. Sounding too smooth is NOT fine.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: fullPrompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const rawText: string = data.content?.[0]?.text || '';

  // ── FinOps: log Anthropic usage (fire-and-forget) ──
  const anthropicUsage = data.usage as { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | undefined;
  if (anthropicUsage) {
    logUsageEventAsync({
      source: 'flashflow',
      lane: 'FlashFlow',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      input_tokens: anthropicUsage.input_tokens ?? 0,
      output_tokens: anthropicUsage.output_tokens ?? 0,
      cache_read_tokens: anthropicUsage.cache_read_input_tokens ?? 0,
      cache_write_tokens: anthropicUsage.cache_creation_input_tokens ?? 0,
      user_id: input.userId,
      endpoint: '/api/scripts/generate',
      template_key: `script_${input.callerContext ?? 'other'}`,
      agent_id: 'flash',
      metadata: {
        caller_context: input.callerContext,
        creator_style_id: input.creatorStyleId,
        persona: selectedPersona.id,
        structure: structure.id,
      },
    });
  }

  // ── Parse JSON response ──
  const parsed = parseAIResponse(rawText);

  // ── Post-generation quality check ──
  const qualityIssues = checkScriptQuality({
    hook: String(parsed.hook || ''),
    setup: String(parsed.setup || ''),
    body: String(parsed.body || ''),
    cta: String(parsed.cta || ''),
  });
  if (qualityIssues.length > 0) {
    console.warn('[unified-script-generator] Quality issues:', qualityIssues.map(i => `${i.field}: ${i.issue}`).join('; '));
  }

  // ── Optional punch-up pass ──
  const shouldPunchUp = input.enablePunchUp ?? (input.callerContext === 'pipeline');
  let punchedUp = false;
  let finalHook = String(parsed.hook || input.hookText || '');
  let finalSetup = String(parsed.setup || '');
  let finalBody = String(parsed.body || '');
  let finalCta = String(parsed.cta || '');
  let finalOnScreenText = Array.isArray(parsed.on_screen_text) ? parsed.on_screen_text.map(String) : [];
  let finalFilmingNotes = String(parsed.filming_notes || '');

  if (shouldPunchUp && (qualityIssues.length > 0 || Math.random() < 0.5)) {
    const punchResult = await punchUpScript(
      {
        hook: finalHook,
        setup: finalSetup,
        body: finalBody,
        cta: finalCta,
        on_screen_text: finalOnScreenText,
        filming_notes: finalFilmingNotes,
      },
      voicePack.name,
    );

    if (punchResult.punchedUp) {
      punchedUp = true;
      finalHook = punchResult.script.hook;
      finalSetup = punchResult.script.setup;
      finalBody = punchResult.script.body;
      finalCta = punchResult.script.cta;
      if (punchResult.script.on_screen_text) finalOnScreenText = punchResult.script.on_screen_text;
      if (punchResult.script.filming_notes) finalFilmingNotes = punchResult.script.filming_notes;
    }

    // Log punch-up usage
    if (punchResult.inputTokens > 0) {
      logUsageEventAsync({
        source: 'flashflow',
        lane: 'FlashFlow',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        input_tokens: punchResult.inputTokens,
        output_tokens: punchResult.outputTokens,
        user_id: input.userId,
        endpoint: '/api/scripts/generate',
        template_key: 'script_punchup',
        agent_id: 'flash',
      });
    }
  }

  // ── Build spoken script from structured parts ──
  const spokenParts = [
    finalHook,
    finalSetup,
    finalBody,
    finalCta,
  ].filter(Boolean);

  // Remove stage directions for the spoken script (TTS can't read [actions])
  const spokenScript = spokenParts
    .join(' ')
    .replace(/\[.*?\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    spokenScript,
    hook: finalHook,
    setup: finalSetup,
    body: finalBody,
    cta: finalCta,
    onScreenText: finalOnScreenText,
    caption: String(parsed.caption || ''),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map(String)
      : [],
    filmingNotes: finalFilmingNotes,
    persona: selectedPersona.name,
    salesApproach: selectedApproach.name,
    estimatedLength: String(parsed.estimated_length || `${wordLimit.seconds} seconds`),
    editorNotes: Array.isArray(parsed.editor_notes)
      ? parsed.editor_notes.map(String)
      : [],
    creatorStyleRef: creatorStyleContext ? input.creatorStyleId : undefined,
    structureUsed: structure.name,
    punchedUp,
  };
}

// ---------------------------------------------------------------------------
// JSON parsing with repair logic
// ---------------------------------------------------------------------------

function parseAIResponse(raw: string): Record<string, unknown> {
  // Strip markdown code fences if present
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Attempt 1: Direct parse
  try {
    return JSON.parse(text);
  } catch {
    // continue to repair
  }

  // Attempt 2: Extract JSON object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    let jsonStr = text.substring(firstBrace, lastBrace + 1);

    // Repair control characters inside quoted strings
    jsonStr = jsonStr.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, content) => {
      content = content.replace(/\n/g, '\\n');
      content = content.replace(/\t/g, '\\t');
      content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      return `"${content}"`;
    });

    try {
      return JSON.parse(jsonStr);
    } catch {
      // continue to fallback
    }
  }

  // Attempt 3: Build minimal object from raw text
  console.warn('[unified-script-generator] JSON parse failed, using fallback');
  return {
    hook: '',
    setup: '',
    body: text.slice(0, 600),
    cta: 'Check it out!',
    on_screen_text: ['Generated content'],
    caption: text.slice(0, 180),
    hashtags: ['#content', '#fyp'],
    filming_notes: '',
    editor_notes: [],
    estimated_length: '30 seconds',
  };
}
