// lib/prompt-builder.ts - Comprehensive AI prompt builder
// Builds the full context prompt for content generation

import {
  getContentType,
  getContentSubtype,
  getPresentationStyle,
  getTargetLength,
  getHumorLevel,
} from './content-types';

// Full persona interface from database
export interface FullPersona {
  id: string;
  name: string;
  description?: string;
  // Demographics
  age_range?: string;
  gender?: string;
  income_level?: string;
  location_type?: string;
  life_stage?: string;
  lifestyle?: string[];
  // Psychographics
  values?: string[];
  interests?: string[];
  personality_traits?: string[];
  // Communication
  tone?: string;
  humor_style?: string;
  attention_span?: string;
  trust_builders?: string[];
  // Pain & motivators
  pain_points?: string[];
  emotional_triggers?: string[];
  buying_objections?: string[];
  purchase_motivators?: string[];
  // Language
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  // Content preferences
  content_preferences?: string[];
  platform_preferences?: string[];
}

export interface ProductContext {
  name: string;
  brand?: string;
  description?: string;
  benefits?: string[];
  unique_selling_points?: string[];
  price_point?: string;
}

export interface ContentContext {
  // Content type
  contentType: string;
  contentSubtype: string;
  // Product
  product: ProductContext;
  // Audience
  persona?: FullPersona;
  selectedPainPoints?: string[];
  // Presentation
  presentationStyle: string;
  targetLength: string;
  // Style
  tone?: string;
  humorLevel?: string;
  // Advanced
  templateContent?: string;
  referenceScript?: string;
  specificHooks?: string[];
  thingsToAvoid?: string[];
  ctaPreference?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
  metadata: {
    contentType: string;
    contentSubtype: string;
    presentationStyle: string;
    funnelStage: string;
    personaName?: string;
    painPointsTargeted: string[];
    toneUsed: string;
    humorLevel: string;
    estimatedLength: string;
  };
}

// Build the full AI prompt with all context
export function buildFullPrompt(context: ContentContext): BuiltPrompt {
  const parts: string[] = [];

  // Get type definitions
  const contentTypeInfo = getContentType(context.contentType);
  const subtypeInfo = getContentSubtype(context.contentType, context.contentSubtype);
  const presentationStyleInfo = getPresentationStyle(context.presentationStyle);
  const targetLengthInfo = getTargetLength(context.targetLength);
  const humorLevelInfo = getHumorLevel(context.humorLevel || 'light');

  // ===== SYSTEM CONTEXT =====
  parts.push(`You are an expert short-form video scriptwriter specializing in viral content for TikTok, Instagram Reels, and YouTube Shorts. You understand audience psychology, hook writing, and conversion-focused storytelling.`);
  parts.push('');

  // ===== CONTENT TYPE CONTEXT =====
  parts.push('## CONTENT TYPE');
  if (contentTypeInfo) {
    parts.push(`Type: ${contentTypeInfo.name}`);
    parts.push(`Funnel Stage: ${contentTypeInfo.funnelStage.toUpperCase()}`);
    parts.push(`Purpose: ${contentTypeInfo.description}`);
  }
  if (subtypeInfo) {
    parts.push(`Subtype: ${subtypeInfo.name} - ${subtypeInfo.description}`);
  }
  parts.push('');

  // Content type specific instructions
  if (contentTypeInfo) {
    parts.push('### Content Type Rules');
    switch (contentTypeInfo.id) {
      case 'tof':
        parts.push('- Focus on STOPPING THE SCROLL - the first 1-2 seconds are everything');
        parts.push('- Create curiosity gaps that make people NEED to keep watching');
        parts.push('- Avoid mentioning the product name in the first 3 seconds');
        parts.push('- End with intrigue, not a hard sell');
        break;
      case 'mof':
        parts.push('- Assume viewer has some awareness - skip the cold open');
        parts.push('- Provide genuine value and education');
        parts.push('- Show the product in action naturally');
        parts.push('- Build trust through transparency');
        break;
      case 'bof':
        parts.push('- Lead with the offer or urgency');
        parts.push('- Address objections directly');
        parts.push('- Clear, compelling CTA');
        parts.push('- Create FOMO without being sleazy');
        break;
      case 'testimonial':
        parts.push('- Write as if the customer is speaking naturally');
        parts.push('- Include specific details that feel authentic');
        parts.push('- Show the transformation or result');
        parts.push('- Avoid scripted-sounding language');
        break;
      case 'skit':
        parts.push('- Character voices must be distinct');
        parts.push('- Set up the joke/situation quickly');
        parts.push('- Product integration should feel natural, not forced');
        parts.push('- End with a laugh or memorable moment');
        break;
      case 'educational':
        parts.push('- Lead with the most valuable insight');
        parts.push('- Use "You" language to make it personal');
        parts.push('- Keep explanations simple and visual');
        parts.push('- Connect learning to product naturally');
        break;
      case 'story':
        parts.push('- Open with conflict or tension');
        parts.push('- Make the protagonist relatable');
        parts.push('- Build emotional arc');
        parts.push('- Resolution ties to product benefit');
        break;
    }
    parts.push('');
  }

  // ===== PRESENTATION STYLE =====
  parts.push('## PRESENTATION STYLE');
  if (presentationStyleInfo) {
    parts.push(`Style: ${presentationStyleInfo.name}`);
    parts.push(`Description: ${presentationStyleInfo.description}`);
    parts.push(`Tips: ${presentationStyleInfo.tips}`);
    parts.push('');

    // Style-specific formatting instructions
    parts.push('### Script Format for This Style');
    switch (presentationStyleInfo.id) {
      case 'talking_head':
        parts.push('Format the script with [TALKING HEAD] and [B-ROLL: description] markers:');
        parts.push('');
        parts.push('[TALKING HEAD]');
        parts.push('"Opening line delivered to camera"');
        parts.push('[B-ROLL: Visual description for cutaway]');
        parts.push('[TALKING HEAD]');
        parts.push('"Next line..."');
        parts.push('[B-ROLL: Another visual]');
        parts.push('[TEXT OVERLAY: Key phrase to display]');
        parts.push('');
        parts.push('Include B-roll marker every 3-5 seconds of talking head.');
        break;
      case 'human_actor':
        parts.push('Format as a screenplay with character names and action lines:');
        parts.push('');
        parts.push('[SCENE: Location description]');
        parts.push('CHARACTER 1: "Dialogue here"');
        parts.push('[ACTION: Physical action or reaction]');
        parts.push('CHARACTER 2: "Response dialogue"');
        break;
      case 'voiceover':
        parts.push('Format with [VO] for voiceover and [VISUAL] for what\'s on screen:');
        parts.push('');
        parts.push('[VISUAL: Description of what viewer sees]');
        parts.push('[VO] "Voiceover narration here"');
        parts.push('[TEXT: On-screen text]');
        break;
      case 'text_overlay':
        parts.push('Format with numbered text cards and background description:');
        parts.push('');
        parts.push('[BACKGROUND: Visual description]');
        parts.push('[TEXT 1] "First text overlay"');
        parts.push('[TEXT 2] "Second text overlay"');
        parts.push('[MUSIC: Mood/genre suggestion]');
        break;
      case 'ugc_style':
        parts.push('Format as casual, off-the-cuff speech with natural pauses:');
        parts.push('');
        parts.push('[SELFIE CAM - casual setting]');
        parts.push('"Okay so like... [natural pause] you need to see this"');
        parts.push('[SHOWS PRODUCT to camera]');
        parts.push('"I literally just discovered this and..."');
        break;
      default:
        parts.push('Format with clear scene breaks and speaker labels.');
    }
    parts.push('');
  }

  // ===== PRODUCT CONTEXT =====
  parts.push('## PRODUCT');
  parts.push(`Name: ${context.product.name}`);
  if (context.product.brand) {
    parts.push(`Brand: ${context.product.brand}`);
  }
  if (context.product.description) {
    parts.push(`Description: ${context.product.description}`);
  }
  if (context.product.benefits?.length) {
    parts.push(`Key Benefits:`);
    context.product.benefits.forEach(b => parts.push(`- ${b}`));
  }
  if (context.product.unique_selling_points?.length) {
    parts.push(`Unique Selling Points:`);
    context.product.unique_selling_points.forEach(usp => parts.push(`- ${usp}`));
  }
  parts.push('');

  // ===== AUDIENCE CONTEXT (FULL) =====
  if (context.persona) {
    const p = context.persona;
    parts.push('## TARGET AUDIENCE');
    parts.push(`Persona: ${p.name}`);
    if (p.description) {
      parts.push(`Description: ${p.description}`);
    }
    parts.push('');

    // Demographics
    parts.push('### Demographics');
    if (p.age_range) parts.push(`Age Range: ${p.age_range}`);
    if (p.gender) parts.push(`Gender: ${p.gender}`);
    if (p.income_level) parts.push(`Income Level: ${p.income_level}`);
    if (p.location_type) parts.push(`Location: ${p.location_type}`);
    if (p.life_stage) parts.push(`Life Stage: ${p.life_stage}`);
    if (p.lifestyle?.length) parts.push(`Lifestyle: ${p.lifestyle.join(', ')}`);
    parts.push('');

    // Psychographics
    parts.push('### Psychographics');
    if (p.values?.length) parts.push(`Values: ${p.values.join(', ')}`);
    if (p.interests?.length) parts.push(`Interests: ${p.interests.join(', ')}`);
    if (p.personality_traits?.length) parts.push(`Personality: ${p.personality_traits.join(', ')}`);
    parts.push('');

    // Communication Style
    parts.push('### Communication Style');
    if (p.tone) parts.push(`Preferred Tone: ${p.tone}`);
    if (p.humor_style) parts.push(`Humor Style: ${p.humor_style}`);
    if (p.attention_span) parts.push(`Attention Span: ${p.attention_span}`);
    if (p.trust_builders?.length) parts.push(`Trust Builders: ${p.trust_builders.join(', ')}`);
    parts.push('');

    // Pain Points
    const painPointsToUse = context.selectedPainPoints?.length
      ? context.selectedPainPoints
      : p.pain_points?.slice(0, 3);
    if (painPointsToUse?.length) {
      parts.push('### Pain Points to Address');
      painPointsToUse.forEach(pp => parts.push(`- ${pp}`));
      parts.push('');
    }

    // Emotional triggers
    if (p.emotional_triggers?.length) {
      parts.push('### Emotional Triggers');
      p.emotional_triggers.forEach(et => parts.push(`- ${et}`));
      parts.push('');
    }

    // Objections
    if (p.buying_objections?.length) {
      parts.push('### Buying Objections to Overcome');
      p.buying_objections.forEach(bo => parts.push(`- ${bo}`));
      parts.push('');
    }

    // Motivators
    if (p.purchase_motivators?.length) {
      parts.push('### Purchase Motivators');
      p.purchase_motivators.forEach(pm => parts.push(`- ${pm}`));
      parts.push('');
    }

    // Language
    if (p.phrases_they_use?.length) {
      parts.push('### Phrases They Use (Mirror These)');
      p.phrases_they_use.forEach(ptu => parts.push(`- "${ptu}"`));
      parts.push('');
    }
    if (p.phrases_to_avoid?.length) {
      parts.push('### Phrases to AVOID');
      p.phrases_to_avoid.forEach(pta => parts.push(`- "${pta}"`));
      parts.push('');
    }

    // Content preferences
    if (p.content_preferences?.length) {
      parts.push('### Content Preferences');
      parts.push(p.content_preferences.join(', '));
      parts.push('');
    }
  }

  // ===== STYLE INSTRUCTIONS =====
  parts.push('## STYLE INSTRUCTIONS');
  const toneToUse = context.tone || context.persona?.tone || 'conversational';
  parts.push(`Tone: ${toneToUse}`);

  if (humorLevelInfo) {
    parts.push(`Humor Level: ${humorLevelInfo.name} - ${humorLevelInfo.description}`);
  }

  if (targetLengthInfo) {
    parts.push(`Target Length: ${targetLengthInfo.name} (${targetLengthInfo.seconds} seconds, ${targetLengthInfo.sceneCount})`);
  }
  parts.push('');

  // ===== ADVANCED OPTIONS =====
  if (context.templateContent) {
    parts.push('## TEMPLATE TO FOLLOW');
    parts.push(context.templateContent);
    parts.push('');
  }

  if (context.referenceScript) {
    parts.push('## REFERENCE SCRIPT (Use as Inspiration)');
    parts.push(context.referenceScript);
    parts.push('');
  }

  if (context.specificHooks?.length) {
    parts.push('## SPECIFIC HOOKS TO TRY');
    context.specificHooks.forEach(h => parts.push(`- ${h}`));
    parts.push('');
  }

  if (context.thingsToAvoid?.length) {
    parts.push('## THINGS TO AVOID');
    context.thingsToAvoid.forEach(ta => parts.push(`- ${ta}`));
    parts.push('');
  }

  if (context.ctaPreference) {
    parts.push('## CTA PREFERENCE');
    parts.push(context.ctaPreference);
    parts.push('');
  }

  // ===== OUTPUT INSTRUCTIONS =====
  parts.push('## OUTPUT INSTRUCTIONS');
  parts.push('Generate 3 script variations. For each variation:');
  parts.push('1. Start with a pattern-interrupt hook');
  parts.push('2. Follow the script format for the presentation style');
  parts.push('3. Keep within the target length');
  parts.push('4. Include B-roll suggestions if presentation style requires them');
  parts.push('5. End with an appropriate CTA for the funnel stage');
  parts.push('');
  parts.push('Return as JSON:');
  parts.push('```json');
  parts.push('{');
  parts.push('  "variations": [');
  parts.push('    {');
  parts.push('      "hook": "The opening hook",');
  parts.push('      "script": "Full formatted script",');
  parts.push('      "broll_suggestions": ["suggestion 1", "suggestion 2"],');
  parts.push('      "estimated_seconds": 25,');
  parts.push('      "cta": "The call to action"');
  parts.push('    }');
  parts.push('  ]');
  parts.push('}');
  parts.push('```');

  const fullPrompt = parts.join('\n');

  return {
    systemPrompt: parts.slice(0, 3).join('\n'),
    userPrompt: parts.slice(3).join('\n'),
    fullPrompt,
    metadata: {
      contentType: contentTypeInfo?.name || context.contentType,
      contentSubtype: subtypeInfo?.name || context.contentSubtype,
      presentationStyle: presentationStyleInfo?.name || context.presentationStyle,
      funnelStage: contentTypeInfo?.funnelStage || 'awareness',
      personaName: context.persona?.name,
      painPointsTargeted: context.selectedPainPoints || context.persona?.pain_points?.slice(0, 3) || [],
      toneUsed: toneToUse,
      humorLevel: humorLevelInfo?.name || 'Light',
      estimatedLength: targetLengthInfo?.seconds || '15-30',
    },
  };
}

// Extract B-roll suggestions from a generated script
export function extractBrollSuggestions(script: string): string[] {
  const brollRegex = /\[B-ROLL:\s*([^\]]+)\]/gi;
  const suggestions: string[] = [];
  let match;

  while ((match = brollRegex.exec(script)) !== null) {
    suggestions.push(match[1].trim());
  }

  return suggestions;
}
