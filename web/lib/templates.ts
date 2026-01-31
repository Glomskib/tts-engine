// Default content templates for quick-start script generation

export interface TemplateStructure {
  hook_style: string;
  beat_count: number;
  tone: string;
  cta_style: string;
  suggested_duration: string;
}

export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'ugc' | 'educational' | 'lifestyle' | 'promotional' | 'trending';
  structure: TemplateStructure;
  example_hook: string;
  best_for: string[];
  intensity_range: [number, number];
  icon: string;
}

export const DEFAULT_TEMPLATES: ContentTemplate[] = [
  {
    id: 'product-review',
    name: 'Honest Product Review',
    description: 'Authentic review format with hook, demo, and verdict. Great for building trust.',
    category: 'ugc',
    structure: {
      hook_style: 'POV or Question',
      beat_count: 4,
      tone: 'casual-authentic',
      cta_style: 'soft-sell',
      suggested_duration: '30-45s',
    },
    example_hook: 'POV: You finally found a product that actually works',
    best_for: ['supplements', 'skincare', 'tech gadgets', 'home products'],
    intensity_range: [3, 6],
    icon: 'star',
  },
  {
    id: 'day-in-life',
    name: 'Day in the Life',
    description: 'Show how the product fits into daily routine. Lifestyle-focused content.',
    category: 'lifestyle',
    structure: {
      hook_style: 'Morning routine start',
      beat_count: 5,
      tone: 'relatable-aspirational',
      cta_style: 'integrated',
      suggested_duration: '45-60s',
    },
    example_hook: '5am morning routine that changed everything',
    best_for: ['wellness', 'productivity', 'food & beverage', 'fitness'],
    intensity_range: [2, 5],
    icon: 'sun',
  },
  {
    id: 'before-after',
    name: 'Before/After Transformation',
    description: 'Dramatic transformation reveal. High engagement potential.',
    category: 'ugc',
    structure: {
      hook_style: 'Tease the result',
      beat_count: 3,
      tone: 'dramatic-excited',
      cta_style: 'urgency',
      suggested_duration: '15-30s',
    },
    example_hook: 'I can\'t believe this is the same person',
    best_for: ['skincare', 'fitness', 'home improvement', 'organization'],
    intensity_range: [5, 8],
    icon: 'arrows',
  },
  {
    id: 'storytime',
    name: 'Storytime',
    description: 'Personal story format that hooks viewers with narrative tension.',
    category: 'ugc',
    structure: {
      hook_style: 'Dramatic statement',
      beat_count: 5,
      tone: 'conversational-emotional',
      cta_style: 'natural-mention',
      suggested_duration: '45-90s',
    },
    example_hook: 'The thing nobody told me about [problem]...',
    best_for: ['any product with a problem-solution angle'],
    intensity_range: [4, 7],
    icon: 'book',
  },
  {
    id: 'tutorial-how-to',
    name: 'Quick Tutorial',
    description: 'Educational content showing how to use or get results with a product.',
    category: 'educational',
    structure: {
      hook_style: 'Promise a result',
      beat_count: 4,
      tone: 'helpful-expert',
      cta_style: 'educational',
      suggested_duration: '30-45s',
    },
    example_hook: 'The trick nobody is talking about',
    best_for: ['beauty', 'tech', 'cooking', 'DIY'],
    intensity_range: [2, 5],
    icon: 'lightbulb',
  },
  {
    id: 'myth-busting',
    name: 'Myth Busting',
    description: 'Challenge common beliefs to grab attention and educate.',
    category: 'educational',
    structure: {
      hook_style: 'Controversial statement',
      beat_count: 4,
      tone: 'authoritative-surprising',
      cta_style: 'proof-based',
      suggested_duration: '30-45s',
    },
    example_hook: 'Everything you know about [topic] is wrong',
    best_for: ['supplements', 'finance', 'health', 'fitness'],
    intensity_range: [5, 8],
    icon: 'xmark',
  },
  {
    id: 'unboxing-first-impressions',
    name: 'Unboxing & First Impressions',
    description: 'Authentic first-time reaction to a product. Great for launches.',
    category: 'ugc',
    structure: {
      hook_style: 'Excitement or curiosity',
      beat_count: 4,
      tone: 'genuine-excited',
      cta_style: 'soft-recommendation',
      suggested_duration: '30-45s',
    },
    example_hook: 'It finally came and I\'m freaking out',
    best_for: ['tech', 'beauty', 'subscription boxes', 'fashion'],
    intensity_range: [4, 7],
    icon: 'gift',
  },
  {
    id: 'comparison',
    name: 'Product Comparison',
    description: 'Compare with alternatives to help decision-making.',
    category: 'educational',
    structure: {
      hook_style: 'Common dilemma',
      beat_count: 5,
      tone: 'objective-helpful',
      cta_style: 'verdict-based',
      suggested_duration: '45-60s',
    },
    example_hook: 'I tried both so you don\'t have to',
    best_for: ['tech', 'skincare', 'home products', 'services'],
    intensity_range: [3, 6],
    icon: 'scale',
  },
  {
    id: 'challenge',
    name: 'Challenge Format',
    description: 'Time-bound challenge with the product. High engagement.',
    category: 'trending',
    structure: {
      hook_style: 'Challenge announcement',
      beat_count: 4,
      tone: 'fun-determined',
      cta_style: 'join-the-challenge',
      suggested_duration: '30-45s',
    },
    example_hook: 'I tried [product] for 30 days and here\'s what happened',
    best_for: ['wellness', 'fitness', 'skincare', 'productivity'],
    intensity_range: [5, 8],
    icon: 'trophy',
  },
  {
    id: 'get-ready-with-me',
    name: 'Get Ready With Me (GRWM)',
    description: 'Popular format showing routine while chatting. Very relatable.',
    category: 'lifestyle',
    structure: {
      hook_style: 'Activity announcement',
      beat_count: 5,
      tone: 'casual-friendly',
      cta_style: 'natural-integrated',
      suggested_duration: '45-60s',
    },
    example_hook: 'GRWM for [occasion] using my new favorite products',
    best_for: ['beauty', 'skincare', 'fashion', 'wellness'],
    intensity_range: [2, 5],
    icon: 'mirror',
  },
  {
    id: 'problem-solution',
    name: 'Problem-Solution',
    description: 'Address a pain point directly, then reveal the solution.',
    category: 'promotional',
    structure: {
      hook_style: 'Pain point statement',
      beat_count: 3,
      tone: 'empathetic-helpful',
      cta_style: 'solution-focused',
      suggested_duration: '20-30s',
    },
    example_hook: 'If you struggle with [problem], keep watching',
    best_for: ['any product solving a clear problem'],
    intensity_range: [4, 7],
    icon: 'check',
  },
  {
    id: 'reaction',
    name: 'Reaction/Response',
    description: 'React to trends, comments, or competitor claims.',
    category: 'trending',
    structure: {
      hook_style: 'Stitch or reaction setup',
      beat_count: 3,
      tone: 'opinionated-engaging',
      cta_style: 'discussion-based',
      suggested_duration: '15-30s',
    },
    example_hook: 'Wait, people are actually saying this works?',
    best_for: ['trendy products', 'controversial topics', 'viral moments'],
    intensity_range: [6, 9],
    icon: 'comment',
  },
];

export const TEMPLATE_CATEGORIES = [
  { id: 'all', name: 'All Templates', icon: 'grid' },
  { id: 'ugc', name: 'UGC', icon: 'user' },
  { id: 'educational', name: 'Educational', icon: 'book' },
  { id: 'lifestyle', name: 'Lifestyle', icon: 'heart' },
  { id: 'promotional', name: 'Promotional', icon: 'megaphone' },
  { id: 'trending', name: 'Trending', icon: 'fire' },
];

export function getTemplateById(id: string): ContentTemplate | undefined {
  return DEFAULT_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: string): ContentTemplate[] {
  if (category === 'all') return DEFAULT_TEMPLATES;
  return DEFAULT_TEMPLATES.filter(t => t.category === category);
}

export function getTemplatesForProduct(productCategory: string): ContentTemplate[] {
  return DEFAULT_TEMPLATES.filter(t =>
    t.best_for.some(bf =>
      bf.toLowerCase().includes(productCategory.toLowerCase()) ||
      productCategory.toLowerCase().includes(bf.toLowerCase())
    )
  );
}
