/**
 * Overlay Clip Index — Rules Parser
 *
 * Fetches and parses overlay_clip_publish_rules.md from the
 * brandons-second-brain-feed GitHub repo to extract ingredient list,
 * product type map, publish thresholds, and risk patterns.
 */

import { getGitHubFeedConfig, fetchFile } from '@/lib/brain-feed/github';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Ingredient {
  name: string;
  synonyms: string[];
}

export interface ProductTypeMapping {
  type: string;
  keywords: string[];
}

export interface PublishThresholds {
  min_transcript_len: number;
  min_ingredients: number;
  min_confidence: number;
  min_format_score: number;
}

export interface ClipRules {
  ingredients: Ingredient[];
  product_types: ProductTypeMapping[];
  thresholds: PublishThresholds;
  risk_patterns: {
    flag: string[];
    reject: string[];
  };
}

// ---------------------------------------------------------------------------
// Defaults (fallback if GitHub fetch fails)
// ---------------------------------------------------------------------------

const DEFAULT_INGREDIENTS: Ingredient[] = [
  { name: 'NAD', synonyms: ['nad+', 'nmn', 'nicotinamide riboside', 'nr'] },
  { name: 'L-Carnitine', synonyms: ['acetyl-l-carnitine', 'alcar'] },
  { name: 'Nitric Oxide', synonyms: ['no', 'nitric oxide booster', 'l-citrulline', 'l-arginine', 'citrulline', 'arginine'] },
  { name: 'Creatine', synonyms: ['creatine monohydrate'] },
  { name: 'Berberine', synonyms: [] },
  { name: 'Ashwagandha', synonyms: [] },
  { name: 'Magnesium', synonyms: ['glycinate', 'threonate', 'magnesium glycinate', 'magnesium threonate'] },
  { name: 'CoQ10', synonyms: ['ubiquinol', 'coenzyme q10'] },
  { name: 'Omega-3', synonyms: ['fish oil', 'epa', 'dha'] },
  { name: 'Collagen', synonyms: ['collagen peptides'] },
  { name: 'Glutathione', synonyms: [] },
  { name: 'Resveratrol', synonyms: [] },
  { name: 'Curcumin', synonyms: ['turmeric extract', 'turmeric'] },
  { name: 'Vitamin D', synonyms: ['d3', 'vitamin d3'] },
  { name: 'Zinc', synonyms: [] },
  { name: 'Probiotics', synonyms: ['probiotic'] },
  { name: 'Electrolytes', synonyms: ['lmnt', 'sodium', 'potassium'] },
  { name: "Lion's Mane", synonyms: ['lions mane'] },
  { name: 'Rhodiola', synonyms: [] },
  { name: 'Ginseng', synonyms: [] },
  { name: 'Alpha GPC', synonyms: ['alpha-gpc'] },
  { name: 'L-Theanine', synonyms: ['theanine'] },
  { name: 'Melatonin', synonyms: [] },
  { name: 'Tongkat Ali', synonyms: [] },
  { name: 'Shilajit', synonyms: [] },
  { name: 'Beetroot', synonyms: ['beet root powder', 'beet root', 'beetroot powder'] },
  { name: 'BCAAs', synonyms: ['eaas', 'bcaa', 'eaa', 'branched chain amino acids', 'essential amino acids'] },
];

const DEFAULT_PRODUCT_TYPES: ProductTypeMapping[] = [
  { type: 'anti-aging', keywords: ['nad', 'nmn', 'nr', 'resveratrol', 'collagen', 'coq10'] },
  { type: 'energy', keywords: ['electrolytes', 'caffeine', 'b vitamins', 'ginseng', 'rhodiola'] },
  { type: 'pump/performance', keywords: ['nitric oxide', 'citrulline', 'arginine', 'beetroot', 'creatine'] },
  { type: 'metabolic', keywords: ['berberine'] },
  { type: 'sleep', keywords: ['magnesium', 'melatonin', 'theanine'] },
  { type: 'cognition', keywords: ["lion's mane", 'alpha gpc'] },
  { type: 'stress', keywords: ['ashwagandha'] },
];

const DEFAULT_THRESHOLDS: PublishThresholds = {
  min_transcript_len: 300,
  min_ingredients: 1,
  min_confidence: 0.65,
  min_format_score: 0.55,
};

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseIngredientLine(line: string): Ingredient | null {
  // Pattern: "- Name (synonym1, synonym2)"
  const match = line.match(/^-\s+(.+?)(?:\s*\((.+?)\))?$/);
  if (!match) return null;

  const name = match[1].trim();
  if (!name) return null;

  const synonyms = match[2]
    ? match[2].split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  return { name, synonyms };
}

function parseProductTypeLine(line: string): ProductTypeMapping | null {
  // Pattern: "- type: keyword1, keyword2, ..."
  const match = line.match(/^-\s+(.+?):\s*(.+)$/);
  if (!match) return null;

  const type = match[1].trim();
  const keywords = match[2].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return { type, keywords };
}

export function parseRulesMarkdown(md: string): ClipRules {
  const lines = md.split('\n');
  const ingredients: Ingredient[] = [];
  const productTypes: ProductTypeMapping[] = [];
  const thresholds: PublishThresholds = { ...DEFAULT_THRESHOLDS };
  const riskPatterns = {
    flag: ['treat', 'cure', 'reverse', 'disease', 'guaranteed', 'doctor says', 'before and after', 'before/after'],
    reject: ['illegal', 'drug', 'hate', 'harassment'],
  };

  let section = '';
  for (const raw of lines) {
    const line = raw.trim();

    // Detect section headers
    if (line.startsWith('## ')) {
      const header = line.replace(/^##\s+/, '').toLowerCase();
      if (header.includes('ingredient list')) section = 'ingredients';
      else if (header.includes('product type')) section = 'product_types';
      else if (header.includes('publish threshold')) section = 'thresholds';
      else if (header.includes('risk flag')) section = 'risk';
      else section = '';
      continue;
    }

    if (!line.startsWith('-')) continue;

    if (section === 'ingredients') {
      const ing = parseIngredientLine(line);
      if (ing) ingredients.push(ing);
    } else if (section === 'product_types') {
      const pt = parseProductTypeLine(line);
      if (pt) productTypes.push(pt);
    } else if (section === 'thresholds') {
      // Parse threshold values like "- confidence >= 0.65"
      const tm = line.match(/-\s+.*?>=?\s*([\d.]+)/);
      if (tm) {
        const val = parseFloat(tm[1]);
        if (line.includes('transcript') && line.includes('length')) thresholds.min_transcript_len = val;
        else if (line.includes('ingredient')) thresholds.min_ingredients = val;
        else if (line.includes('confidence')) thresholds.min_confidence = val;
        else if (line.includes('format_score')) thresholds.min_format_score = val;
      }
    }
  }

  return {
    ingredients: ingredients.length > 0 ? ingredients : DEFAULT_INGREDIENTS,
    product_types: productTypes.length > 0 ? productTypes : DEFAULT_PRODUCT_TYPES,
    thresholds,
    risk_patterns: riskPatterns,
  };
}

// ---------------------------------------------------------------------------
// Cached fetch from GitHub
// ---------------------------------------------------------------------------

let _cachedRules: ClipRules | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const RULES_PATH = 'Vault/Skills/overlay_clip_publish_rules.md';

export async function getClipRules(): Promise<ClipRules> {
  if (_cachedRules && Date.now() < _cacheExpiry) {
    return _cachedRules;
  }

  const cfg = getGitHubFeedConfig();
  if (!cfg) {
    console.warn('[clip-index/rules] GitHub not configured, using defaults');
    _cachedRules = {
      ingredients: DEFAULT_INGREDIENTS,
      product_types: DEFAULT_PRODUCT_TYPES,
      thresholds: DEFAULT_THRESHOLDS,
      risk_patterns: {
        flag: ['treat', 'cure', 'reverse', 'disease', 'guaranteed', 'doctor says', 'before and after', 'before/after'],
        reject: ['illegal', 'drug', 'hate', 'harassment'],
      },
    };
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    return _cachedRules;
  }

  try {
    const file = await fetchFile(cfg, RULES_PATH);
    _cachedRules = parseRulesMarkdown(file.content);
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    console.log(`[clip-index/rules] Parsed ${_cachedRules.ingredients.length} ingredients from GitHub`);
    return _cachedRules;
  } catch (err) {
    console.error('[clip-index/rules] Failed to fetch rules from GitHub:', err);
    // Fall back to defaults
    _cachedRules = {
      ingredients: DEFAULT_INGREDIENTS,
      product_types: DEFAULT_PRODUCT_TYPES,
      thresholds: DEFAULT_THRESHOLDS,
      risk_patterns: {
        flag: ['treat', 'cure', 'reverse', 'disease', 'guaranteed', 'doctor says', 'before and after', 'before/after'],
        reject: ['illegal', 'drug', 'hate', 'harassment'],
      },
    };
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    return _cachedRules;
  }
}
