// lib/content-types.ts - Comprehensive content type definitions
// Single source of truth for all video content types, presentation styles, and options

export interface ContentSubtype {
  id: string;
  name: string;
  description: string;
}

export interface ContentType {
  id: string;
  name: string;
  description: string;
  funnelStage: 'awareness' | 'consideration' | 'conversion';
  icon: string;
  subtypes: ContentSubtype[];
}

export const CONTENT_TYPES: ContentType[] = [
  {
    id: 'tof',
    name: 'Top of Funnel (TOF)',
    description: 'Awareness content - hooks, viral moments, pattern interrupts',
    funnelStage: 'awareness',
    icon: 'Megaphone',
    subtypes: [
      { id: 'hook_teaser', name: 'Hook / Teaser', description: 'Quick attention grabber' },
      { id: 'viral_moment', name: 'Viral Moment', description: 'Shareable, unexpected content' },
      { id: 'trend', name: 'Trend Participation', description: 'Ride existing trends' },
      { id: 'educational_snippet', name: 'Educational Snippet', description: 'Quick value bomb' },
      { id: 'relatable', name: 'Relatable Content', description: '"OMG that\'s so me"' },
    ],
  },
  {
    id: 'mof',
    name: 'Middle of Funnel (MOF)',
    description: 'Consideration content - demos, comparisons, deeper education',
    funnelStage: 'consideration',
    icon: 'Search',
    subtypes: [
      { id: 'product_demo', name: 'Product Demo', description: 'Show how it works' },
      { id: 'how_it_works', name: 'How It Works', description: 'Explain the process' },
      { id: 'comparison', name: 'Comparison', description: 'Us vs. alternatives' },
      { id: 'day_in_life', name: 'Day in the Life', description: 'Product in context' },
      { id: 'behind_scenes', name: 'Behind the Scenes', description: 'Build connection' },
    ],
  },
  {
    id: 'bof',
    name: 'Bottom of Funnel (BOF)',
    description: 'Conversion content - offers, urgency, direct response',
    funnelStage: 'conversion',
    icon: 'ShoppingCart',
    subtypes: [
      { id: 'limited_offer', name: 'Limited Time Offer', description: 'Urgency-driven' },
      { id: 'flash_sale', name: 'Flash Sale', description: 'Time-sensitive deal' },
      { id: 'direct_response', name: 'Direct Response', description: 'Clear CTA focus' },
      { id: 'objection_handler', name: 'Objection Handler', description: 'Address final concerns' },
      { id: 'final_push', name: 'Final Push', description: 'Last chance messaging' },
    ],
  },
  {
    id: 'testimonial',
    name: 'Testimonial / UGC',
    description: 'Social proof - reviews, results, transformations',
    funnelStage: 'consideration',
    icon: 'Star',
    subtypes: [
      { id: 'customer_story', name: 'Customer Story', description: 'Real experience narrative' },
      { id: 'before_after', name: 'Before / After', description: 'Transformation showcase' },
      { id: 'unboxing', name: 'Unboxing', description: 'First impressions' },
      { id: 'review', name: 'Review', description: 'Honest assessment' },
      { id: 'results', name: 'Results Showcase', description: 'Proof of outcome' },
    ],
  },
  {
    id: 'skit',
    name: 'Skit / Comedy',
    description: 'Entertainment-first - dialogue, characters, humor',
    funnelStage: 'awareness',
    icon: 'Theater',
    subtypes: [
      { id: 'two_person', name: 'Two-Person Dialogue', description: 'Classic back-and-forth' },
      { id: 'character_sketch', name: 'Character Sketch', description: 'Memorable persona' },
      { id: 'parody', name: 'Parody', description: 'Comedic take on something' },
      { id: 'relatable_situation', name: 'Relatable Situation', description: 'Everyday comedy' },
      { id: 'product_integration', name: 'Product Integration', description: 'Natural product moment' },
    ],
  },
  {
    id: 'educational',
    name: 'Educational / How-To',
    description: 'Value-first content - tutorials, tips, expertise',
    funnelStage: 'consideration',
    icon: 'GraduationCap',
    subtypes: [
      { id: 'quick_tip', name: 'Quick Tip', description: 'Single actionable insight' },
      { id: 'tutorial', name: 'Step-by-Step Tutorial', description: 'Detailed instructions' },
      { id: 'myth_busting', name: 'Myth Busting', description: 'Correct misconceptions' },
      { id: 'expert_advice', name: 'Expert Advice', description: 'Authority positioning' },
      { id: 'listicle', name: 'Listicle', description: '3 reasons, 5 tips, etc.' },
    ],
  },
  {
    id: 'story',
    name: 'Story / Narrative',
    description: 'Emotional connection - personal stories, journeys',
    funnelStage: 'awareness',
    icon: 'BookOpen',
    subtypes: [
      { id: 'origin_story', name: 'Origin Story', description: 'How it all started' },
      { id: 'transformation', name: 'Transformation Journey', description: 'Before to after' },
      { id: 'day_in_life_story', name: 'Day in the Life', description: 'Relatable narrative' },
      { id: 'struggle_success', name: 'Struggle to Success', description: 'Overcoming obstacles' },
      { id: 'founder_story', name: 'Founder Story', description: 'Personal brand building' },
    ],
  },
];

export interface PresentationStyle {
  id: string;
  name: string;
  description: string;
  icon: string;
  brollHeavy: boolean;
  tips: string;
}

export const PRESENTATION_STYLES: PresentationStyle[] = [
  {
    id: 'talking_head',
    name: 'Talking Head / Green Screen',
    description: 'Direct to camera, presenter-style with B-roll cutaways',
    icon: 'User',
    brollHeavy: true,
    tips: 'Great for educational, testimonials, and personality-driven content. Cut to B-roll every 3-5 seconds.',
  },
  {
    id: 'human_actor',
    name: 'Human Actor (Skit)',
    description: 'On-camera performer with physical comedy and scene work',
    icon: 'Theater',
    brollHeavy: false,
    tips: 'Best for comedy skits, dialogues, and character-driven content.',
  },
  {
    id: 'ai_avatar',
    name: 'AI Avatar',
    description: 'AI-generated presenter for faceless content',
    icon: 'Bot',
    brollHeavy: true,
    tips: 'Good for scaling content without on-camera talent.',
  },
  {
    id: 'voiceover',
    name: 'Voiceover Only',
    description: 'No on-camera talent, pure voiceover with visuals',
    icon: 'Mic',
    brollHeavy: true,
    tips: 'Relies heavily on B-roll, text overlays, and visual storytelling.',
  },
  {
    id: 'text_overlay',
    name: 'Text Overlay / Caption Style',
    description: 'Text-driven content with background visuals',
    icon: 'Type',
    brollHeavy: true,
    tips: 'Works well for listicles, facts, and scroll-stopping content.',
  },
  {
    id: 'ugc_style',
    name: 'UGC / iPhone Style',
    description: 'Raw, authentic, user-generated content aesthetic',
    icon: 'Smartphone',
    brollHeavy: false,
    tips: 'Intentionally imperfect, feels like real customer content.',
  },
  {
    id: 'mixed',
    name: 'Mixed / Hybrid',
    description: 'Combination of talking head, B-roll, and skits',
    icon: 'Layers',
    brollHeavy: true,
    tips: 'Most versatile, allows for dynamic pacing.',
  },
];

export interface TargetLength {
  id: string;
  name: string;
  seconds: string;
  sceneCount: string;
  description: string;
}

export const TARGET_LENGTHS: TargetLength[] = [
  { id: 'micro', name: 'Micro (5-15s)', seconds: '5-15', sceneCount: '1-2 scenes', description: 'Hooks, teasers, pattern interrupts' },
  { id: 'short', name: 'Short (15-30s)', seconds: '15-30', sceneCount: '3-5 scenes', description: 'Standard TikTok/Reels' },
  { id: 'medium', name: 'Medium (30-60s)', seconds: '30-60', sceneCount: '5-8 scenes', description: 'Detailed content, demos' },
  { id: 'long', name: 'Long (60-90s)', seconds: '60-90', sceneCount: '8-12 scenes', description: 'Full narratives, tutorials' },
];

export interface HumorLevel {
  id: string;
  name: string;
  description: string;
}

export const HUMOR_LEVELS: HumorLevel[] = [
  { id: 'none', name: 'None / Serious', description: 'Straight, sincere, no jokes' },
  { id: 'light', name: 'Light', description: 'Occasional wit, smile-worthy' },
  { id: 'moderate', name: 'Moderate', description: 'Clear comedic moments' },
  { id: 'heavy', name: 'Heavy', description: 'Comedy-forward, jokes drive content' },
];

// Helper functions
export function getContentType(id: string): ContentType | undefined {
  return CONTENT_TYPES.find(ct => ct.id === id);
}

export function getContentSubtype(typeId: string, subtypeId: string): ContentSubtype | undefined {
  const type = getContentType(typeId);
  return type?.subtypes.find(st => st.id === subtypeId);
}

export function getPresentationStyle(id: string): PresentationStyle | undefined {
  return PRESENTATION_STYLES.find(ps => ps.id === id);
}

export function getTargetLength(id: string): TargetLength | undefined {
  return TARGET_LENGTHS.find(tl => tl.id === id);
}

export function getHumorLevel(id: string): HumorLevel | undefined {
  return HUMOR_LEVELS.find(hl => hl.id === id);
}

// Credit costs based on content type and length
export function getGenerationCreditCost(contentType: string, targetLength: string): number {
  const baseCredits: Record<string, number> = {
    'micro': 1,
    'short': 2,
    'medium': 3,
    'long': 4,
  };

  // Skits cost more due to complexity
  const typeMultiplier = contentType === 'skit' ? 1.5 : 1;

  return Math.ceil((baseCredits[targetLength] || 2) * typeMultiplier);
}
