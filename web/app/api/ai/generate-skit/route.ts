import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { enforceRateLimits, extractRateLimitContext } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { auditLogAsync } from "@/lib/audit";
import {
  postProcessSkit,
  validateSkitStructure,
  type RiskTier,
  type Skit,
} from "@/lib/ai/skitPostProcess";
import {
  getSkitTemplate,
  buildTemplatePromptSection,
  validateSkitAgainstTemplate,
  type SkitTemplate,
} from "@/lib/ai/skitTemplates";
import {
  getSkitPreset,
  clampIntensityToPreset,
  buildPresetPromptSection,
  type SkitPreset,
} from "@/lib/ai/skitPresets";
import {
  applySkitBudgetClamp,
  isDebugMode,
} from "@/lib/ai/skitBudget";
import { z } from "zod";
import { TONE_PROMPT_GUIDES, HUMOR_PROMPT_GUIDES } from "@/lib/persona-options";
import {
  getPersonaById,
  buildPersonaPromptSection,
  type CreatorPersona,
} from "@/lib/ai/creatorPersonas";
import {
  fetchWinnersIntelligence,
  fetchWinnerById,
  buildWinnersContext,
  buildWinnerVariationPrompt,
  type Winner,
  type WinnersIntelligence,
} from "@/lib/winners";
import {
  fetchBrandContext,
  buildBrandContextPrompt,
} from "@/lib/ai/brandContext";
import { buildPainPointsPrompt } from "@/lib/ai/productContext";
import {
  getOutputFormatConfig,
  HUMAN_VOICE_INSTRUCTIONS,
  CTA_INSTRUCTIONS,
  BROLL_INSTRUCTIONS,
} from "@/lib/ai/outputFormats";
import type { PainPoint } from "@/lib/ai/painPointGenerator";

export const runtime = "nodejs";
export const maxDuration = 120;

// --- Input Validation Schema (Zod Strict) ---

const RiskTierSchema = z.enum(["SAFE", "BALANCED", "SPICY"]);

const PersonaSchema = z.enum([
  "NONE",
  "DR_PICKLE",
  "CASH_KING",
  "ABSURD_BUDDY",
  "DEADPAN_OFFICE",
  "INFOMERCIAL_CHAOS",
]);

const ActorTypeSchema = z.enum(["human", "ai_avatar", "voiceover", "mixed"]);

const TargetDurationSchema = z.enum(["quick", "standard", "extended", "long"]);

const ContentFormatSchema = z.enum([
  "skit_dialogue",
  "scene_montage",
  "pov_story",
  "product_demo_parody",
  "reaction_commentary",
  "day_in_life",
]);

// Additional creative control schemas
const PacingSchema = z.enum(["slow", "moderate", "fast", "rapid"]);
const HookStrengthSchema = z.enum(["soft", "standard", "strong", "extreme"]);
const AuthenticitySchema = z.enum(["polished", "balanced", "casual", "raw"]);
const PresentationStyleSchema = z.enum([
  "direct_pitch",
  "storytelling",
  "problem_solution",
  "demonstration",
  "testimonial",
  "comparison",
  "tutorial",
  "unboxing",
  "day_in_life",
  "trending",
]);

const GenerateSkitInputSchema = z.object({
  video_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  product_name: z.string().min(3).max(100).optional(),
  brand_name: z.string().max(100).optional(),
  product_display_name: z.string().max(100).optional(),
  cta_overlay: z.string().max(50).optional(),
  risk_tier: RiskTierSchema,
  persona: PersonaSchema,
  creator_persona_id: z.string().max(50).optional(), // New detailed creator persona system
  template_id: z.string().max(50).optional(),
  intensity: z.number().min(0).max(100).optional(),
  preset_id: z.string().max(50).optional(),
  chaos_level: z.number().min(0).max(100).optional(), // Deprecated, use plot_style
  plot_style: z.number().min(0).max(100).optional(),
  creative_direction: z.string().max(500).optional(),
  actor_type: ActorTypeSchema.optional(),
  target_duration: TargetDurationSchema.optional(),
  content_format: ContentFormatSchema.optional(),
  product_context: z.string().max(2000).optional(),
  variation_count: z.number().int().min(1).max(5).optional(),
  // Additional creative controls
  pacing: PacingSchema.optional(),
  hook_strength: HookStrengthSchema.optional(),
  authenticity: AuthenticitySchema.optional(),
  presentation_style: PresentationStyleSchema.optional(),
  dialogue_density: z.number().min(1).max(5).optional(), // 1=minimal dialogue, 5=dialogue heavy
  // Audience Intelligence
  audience_persona_id: z.string().uuid().optional(),
  pain_point_id: z.string().uuid().optional(),
  pain_point_focus: z.array(z.string()).optional(), // Selected pain points from persona
  use_audience_language: z.boolean().optional().default(true),
  // Winners Bank Intelligence
  winner_id: z.string().uuid().optional(), // Generate variation of this winning script
  use_winners_intelligence: z.boolean().optional().default(true), // Learn from user's winners
  // Content type identification (drives prompt framing)
  content_type_id: z.string().max(50).optional(),
  content_subtype_id: z.string().max(50).optional(),
}).strict().refine(
  (data) => data.product_id || data.product_name,
  { message: "Either product_id or product_name is required" }
);

// Audience Persona type from database (updated with rich psychographics)
interface AudiencePersona {
  id: string;
  name: string;
  description?: string;
  // Demographics
  age_range?: string;
  gender?: string;
  income_level?: string;
  location_type?: string;
  life_stage?: string;
  lifestyle?: string;
  // Psychographics
  values?: string[];
  interests?: string[];
  personality_traits?: string[];
  // Communication Style
  tone?: string; // legacy
  tone_preference?: string;
  humor_style?: string;
  attention_span?: string;
  trust_builders?: string[];
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  // Pain Points & Motivations
  pain_points?: Array<{ point: string; intensity?: string; triggers?: string[] }>; // legacy
  primary_pain_points?: string[];
  emotional_triggers?: string[];
  buying_objections?: string[];
  purchase_motivators?: string[];
  common_objections?: string[]; // legacy
  // Content Preferences
  content_they_engage_with?: string[]; // legacy
  content_types_preferred?: string[];
  platforms?: string[];
  best_posting_times?: string;
  // Meta
  beliefs?: Record<string, string>;
  times_used?: number;
}

// Pain Point type from database
interface PainPointData {
  id: string;
  pain_point: string;
  category?: string;
  when_it_happens?: string;
  emotional_state?: string;
  how_they_describe_it?: string[];
  what_they_want?: string;
  objections_to_solutions?: string[];
  times_used?: number;
}

type GenerateSkitInput = z.infer<typeof GenerateSkitInputSchema>;
type Persona = z.infer<typeof PersonaSchema>;

// --- Persona Definitions (Internal Fictional Characters Only) ---

const PERSONA_GUIDELINES: Record<Persona, string> = {
  NONE: `
    No specific character. Write as a friendly, relatable narrator.
    Keep tone conversational and authentic.
  `,
  DR_PICKLE: `
    DR. PICKLE is our internal fictional character - a quirky, enthusiastic "scientist"
    who gets overly excited about simple discoveries. He wears a lab coat covered in
    pickle stickers and speaks with dramatic pauses. He's NOT a real doctor.
    Catchphrase: "Now THAT'S what I call a big dill!"
    Style: Enthusiastic, slightly nerdy, makes everything sound like a breakthrough.
  `,
  CASH_KING: `
    CASH KING is our internal fictional character - a flashy, over-the-top
    "deal hunter" who acts like finding a good product is winning the lottery.
    Wears gold chains made of obviously fake plastic. Self-aware parody of infomercial hosts.
    Catchphrase: "Ka-CHING, baby!"
    Style: High energy, comedic bragging, treats savings like treasure.
  `,
  ABSURD_BUDDY: `
    Comedic archetype: The Absurd Buddy.
    This is the friend who takes everything to ridiculous extremes.
    Overreacts to minor inconveniences, makes dramatic comparisons.
    Style: Deadpan delivery of absurd statements, escalating bits.
    Example: "Before this product, I was basically living like a cave person.
    And not even a cool cave person. Like the cave person other cave people avoided."
  `,
  DEADPAN_OFFICE: `
    Comedic archetype: Deadpan Office Worker.
    Speaks in monotone about mundane things as if they're earth-shattering.
    Corporate jargon mixed with genuine product enthusiasm.
    Style: Flat affect, pauses for effect, unexpectedly sincere moments.
    Example: "I've been in meetings. So many meetings. But this? This is the meeting
    that changed everything. It's not even a meeting. It's a lifestyle."
  `,
  INFOMERCIAL_CHAOS: `
    Comedic archetype: Chaotic Infomercial Parody.
    Self-aware parody of late-night infomercials where everything goes wrong.
    The demonstrator struggles with simple tasks, product "saves the day."
    Style: Exaggerated incompetence, product as unlikely hero.
    Example: "Are you tired of [simple task]? I was! I once spent THREE HOURS
    trying to [basic thing]. My neighbors called authorities."
  `,
};

// --- Risk Tier Prompt Modifiers ---

const TIER_GUIDELINES: Record<RiskTier, string> = {
  SAFE: `
    TONE LEVEL: SAFE (Light Humor)
    - Keep jokes mild and universally relatable
    - Avoid anything edgy or potentially offensive
    - Focus on wholesome, feel-good humor
    - No exaggeration about product benefits
    - No urgency or pressure tactics
    - Suitable for all audiences
  `,
  BALANCED: `
    TONE LEVEL: BALANCED (Sharper But Compliant)
    - Humor can be sharper, more specific
    - Light teasing of common frustrations is OK
    - Can use mild exaggeration for comedic effect
    - Still avoid any health claims or guarantees
    - Can create gentle urgency ("you'll want to try this")
    - Suitable for general social media audiences
  `,
  SPICY: `
    TONE LEVEL: SPICY (Energetic Parody)
    - High energy, bold comedic choices
    - Parody and satire are encouraged
    - Can push creative boundaries
    - Self-aware humor about advertising tropes
    - Still MUST avoid: health claims, guarantees, medical terms
    - Audience: People who appreciate bold comedy
  `,
};

// --- Compliance Reminder (Always Included) ---

const COMPLIANCE_REMINDER = `
CRITICAL COMPLIANCE RULES - NEVER VIOLATE:
1. NEVER use words: cure, treat, heal, diagnose, disease, prescription, clinically
2. NEVER use: guaranteed, guarantee, 100%, always, never (as absolutes)
3. NEVER reference: ADHD, depression, anxiety, pain relief, or any medical conditions
4. NEVER make health claims or promise specific results
5. NEVER "in the style of [real person]" - only use the provided fictional personas
6. Product benefits should be stated as experiences, not medical outcomes
   BAD: "cures your fatigue"
   GOOD: "I actually have energy for my 3pm meetings now"

REAL PERSON IMITATION PROHIBITION:
- NEVER imitate, reference, or parody any real celebrities, influencers, or public figures
- NEVER use catchphrases, mannerisms, or speaking styles associated with real people
- Only use the provided fictional character archetypes (Dr. Pickle, Cash King, etc.)
- Generic comedic archetypes (office worker, friend, news anchor) are fine as TYPES, not specific people
`;

// --- Audience Intelligence Context Builder ---

function buildAudienceContext(
  audiencePersona: AudiencePersona | null,
  painPoint: PainPointData | null,
  painPointFocus: string[],
  useAudienceLanguage: boolean
): string {
  if (!audiencePersona && !painPoint && painPointFocus.length === 0) return "";
  if (!useAudienceLanguage) return "";

  let context = "\n=== TARGET AUDIENCE INTELLIGENCE ===\n";

  if (audiencePersona) {
    context += `
TARGET PERSONA: "${audiencePersona.name}"
${audiencePersona.description ? `Who they are: ${audiencePersona.description}` : ""}
`;

    // Demographics section
    const demographics: string[] = [];
    if (audiencePersona.age_range) demographics.push(`Age: ${audiencePersona.age_range}`);
    if (audiencePersona.gender) demographics.push(`Gender: ${audiencePersona.gender}`);
    if (audiencePersona.life_stage) demographics.push(`Life stage: ${audiencePersona.life_stage}`);
    if (audiencePersona.income_level) demographics.push(`Income: ${audiencePersona.income_level}`);
    if (audiencePersona.location_type) demographics.push(`Location: ${audiencePersona.location_type}`);
    if (audiencePersona.lifestyle) demographics.push(`Lifestyle: ${audiencePersona.lifestyle}`);
    if (demographics.length > 0) {
      context += `DEMOGRAPHICS: ${demographics.join(" | ")}\n`;
    }

    // Psychographics section
    if (audiencePersona.values && audiencePersona.values.length > 0) {
      context += `THEIR VALUES: ${audiencePersona.values.join(", ")}\n`;
    }
    if (audiencePersona.interests && audiencePersona.interests.length > 0) {
      context += `THEIR INTERESTS: ${audiencePersona.interests.join(", ")}\n`;
    }
    if (audiencePersona.personality_traits && audiencePersona.personality_traits.length > 0) {
      context += `PERSONALITY: ${audiencePersona.personality_traits.join(", ")}\n`;
    }

    context += "\n";

    // Pain points - prioritize user-selected focus, then persona pain points
    const allPainPoints = audiencePersona.primary_pain_points?.length
      ? audiencePersona.primary_pain_points
      : audiencePersona.pain_points?.map(pp => pp.point) || [];

    if (painPointFocus.length > 0) {
      // User selected specific pain points to focus on
      context += `
=== PRIMARY PAIN POINT FOCUS ===
The hook MUST call out or acknowledge one of these specific pain points:
${painPointFocus.map((pp, i) => `${i + 1}. "${pp}"`).join("\n")}

CRITICAL: Your opening hook should make the viewer immediately think "OMG that's exactly me!"
The script should clearly show how the product solves THIS specific problem.
===

`;
      // Also show other pain points for context
      const otherPainPoints = allPainPoints.filter(pp => !painPointFocus.includes(pp));
      if (otherPainPoints.length > 0) {
        context += "OTHER PAIN POINTS (for additional context, not primary focus):\n";
        for (const pp of otherPainPoints.slice(0, 3)) {
          context += `- ${pp}\n`;
        }
        context += "\n";
      }
    } else if (allPainPoints.length > 0) {
      // No specific focus - AI chooses the best fit
      context += `THEIR PAIN POINTS - Choose the BEST fit for this product:\n`;
      for (const pp of allPainPoints.slice(0, 4)) {
        context += `- ${pp}\n`;
      }
      context += `\nPick the pain point that BEST connects to the product and build your hook around it.\n\n`;
    }

    // Emotional triggers
    if (audiencePersona.emotional_triggers && audiencePersona.emotional_triggers.length > 0) {
      context += `EMOTIONAL TRIGGERS (what motivates them): ${audiencePersona.emotional_triggers.join(", ")}\n`;
    }

    // What builds trust
    if (audiencePersona.trust_builders && audiencePersona.trust_builders.length > 0) {
      context += `WHAT BUILDS TRUST: ${audiencePersona.trust_builders.join(", ")}\n`;
    }

    context += "\n";

    // Communication style with detailed AI guidance
    const tone = audiencePersona.tone_preference || audiencePersona.tone;
    if (tone) {
      const toneGuide = TONE_PROMPT_GUIDES[tone];
      if (toneGuide) {
        context += `PREFERRED TONE: ${tone}\n${toneGuide}\n`;
      } else {
        context += `PREFERRED TONE: ${tone}\n`;
      }
    }
    if (audiencePersona.humor_style) {
      const humorGuide = HUMOR_PROMPT_GUIDES[audiencePersona.humor_style];
      if (humorGuide) {
        context += `HUMOR STYLE: ${audiencePersona.humor_style}\n${humorGuide}\n`;
      } else {
        context += `HUMOR STYLE: ${audiencePersona.humor_style}\n`;
      }
    }
    if (audiencePersona.attention_span) {
      context += `ATTENTION SPAN: ${audiencePersona.attention_span}\n`;
    }

    // Language patterns
    if (audiencePersona.phrases_they_use && audiencePersona.phrases_they_use.length > 0) {
      context += `\nHOW THEY TALK (use these exact phrases or similar):\n`;
      context += audiencePersona.phrases_they_use.slice(0, 5).map(p => `- "${p}"`).join("\n");
      context += "\n";
    }

    // Phrases to avoid
    if (audiencePersona.phrases_to_avoid && audiencePersona.phrases_to_avoid.length > 0) {
      context += `\nAVOID THESE PHRASES (they sound fake to this audience):\n`;
      context += audiencePersona.phrases_to_avoid.slice(0, 5).map(p => `- "${p}"`).join("\n");
      context += "\n";
    }

    // Objections (prefer new format, fallback to legacy)
    const objections = audiencePersona.buying_objections?.length
      ? audiencePersona.buying_objections
      : audiencePersona.common_objections || [];
    if (objections.length > 0) {
      context += `\nTHEIR OBJECTIONS (address naturally, don't be defensive):\n`;
      context += objections.slice(0, 4).map(o => `- "${o}"`).join("\n");
      context += "\n";
    }

    // Purchase motivators
    if (audiencePersona.purchase_motivators && audiencePersona.purchase_motivators.length > 0) {
      context += `\nWHAT MOTIVATES THEM TO BUY: ${audiencePersona.purchase_motivators.join(", ")}\n`;
    }

    // Content preferences
    const contentPrefs = audiencePersona.content_types_preferred?.length
      ? audiencePersona.content_types_preferred
      : audiencePersona.content_they_engage_with || [];
    if (contentPrefs.length > 0) {
      context += `\nCONTENT THEY ENGAGE WITH: ${contentPrefs.join(", ")}\n`;
    }
    if (audiencePersona.platforms && audiencePersona.platforms.length > 0) {
      context += `PLATFORMS THEY USE: ${audiencePersona.platforms.join(", ")}\n`;
    }

    context += "\n";
  }

  // Specific pain point focus
  if (painPoint) {
    context += `
FOCUS ON THIS SPECIFIC PAIN POINT: "${painPoint.pain_point}"
${painPoint.when_it_happens ? `When it happens: ${painPoint.when_it_happens}` : ""}
${painPoint.emotional_state ? `How they feel: ${painPoint.emotional_state}` : ""}
${painPoint.what_they_want ? `What they want: ${painPoint.what_they_want}` : ""}

`;
    if (painPoint.how_they_describe_it && painPoint.how_they_describe_it.length > 0) {
      context += `How they describe it (use their words):\n`;
      context += painPoint.how_they_describe_it.slice(0, 3).map(d => `- "${d}"`).join("\n");
      context += "\n";
    }
  }

  context += `
AUTHENTICITY REQUIREMENT:
Write this as if YOU ARE this person talking to their friends, not as a brand talking AT them.
Sound like a real person who discovered something helpful, not an ad.
Use their actual language patterns, not marketing speak.
Match their energy, tone, and communication style exactly.
===

`;

  return context;
}

// --- Intensity Guidelines ---

function buildIntensityGuidelines(intensity: number): string {
  if (intensity <= 20) {
    return `
COMEDY INTENSITY: LOW (${intensity}/100)
- Keep pacing relaxed and conversational
- Minimal exaggeration, understated humor
- Gentle observations rather than punchlines
- Calm, friendly energy throughout
`;
  } else if (intensity <= 40) {
    return `
COMEDY INTENSITY: MILD (${intensity}/100)
- Moderate pacing with some energy peaks
- Light exaggeration for comedic effect
- A few clear punchlines mixed with conversational moments
- Approachable, relatable energy
`;
  } else if (intensity <= 60) {
    return `
COMEDY INTENSITY: MEDIUM (${intensity}/100)
- Good comedic rhythm and pacing
- Confident exaggeration and callbacks
- Clear setup/punchline structure
- Engaging energy that holds attention
`;
  } else if (intensity <= 80) {
    return `
COMEDY INTENSITY: HIGH (${intensity}/100)
- Fast pacing with punchy delivery
- Bold exaggeration and sharp punchlines
- Quick cuts and rapid-fire energy
- Memorable one-liners and callbacks
`;
  } else {
    return `
COMEDY INTENSITY: MAXIMUM (${intensity}/100)
- Rapid-fire pacing, high energy throughout
- Maximum comedic exaggeration (within policy)
- Sharpest punchlines, fastest delivery
- Absurdist escalation and bold choices
- Still policy-compliant - no health claims or real person imitation
`;
  }
}

// --- Plot Style Guidelines ---

function buildPlotStyleGuidelines(plotStyle: number): string {
  if (plotStyle <= 20) {
    return `
PLOT STYLE: GROUNDED (${plotStyle}/100)
- Keep the premise realistic and relatable
- Humor comes from observation and truth
- "This is literally my life" energy
- Situations people actually encounter
- Subtle escalation, nothing too wild
`;
  } else if (plotStyle <= 40) {
    return `
PLOT STYLE: PLAYFUL (${plotStyle}/100)
- Slightly exaggerated scenarios
- One unexpected element per beat is fine
- Light absurdity that still tracks logically
- "This could happen on a weird day"
- Room for quirky character choices
`;
  } else if (plotStyle <= 60) {
    return `
PLOT STYLE: ABSURDIST (${plotStyle}/100)
- Embrace weird premises and strange logic
- Non-sequiturs that somehow make sense
- Characters can have bizarre reactions
- "Wait, what?" followed by "okay I'm with it"
- Breaking expectations is encouraged
`;
  } else if (plotStyle <= 80) {
    return `
PLOT STYLE: UNHINGED (${plotStyle}/100)
- Wild premises, surreal situations
- Logic is optional, vibes are mandatory
- Rapid escalation into absurdity
- Characters operating on different wavelengths
- "This makes no sense and I love it"
`;
  } else {
    return `
PLOT STYLE: FEVER DREAM (${plotStyle}/100)
- Full surrealist energy
- Reality is a suggestion
- Stream of consciousness escalation
- Breaking the 4th wall encouraged
- "I watched this 5 times and I still don't know what happened"
- Maximum weirdness while somehow landing the product
`;
  }
}

// --- Actor Type Guidelines ---

type ActorType = "human" | "ai_avatar" | "voiceover" | "mixed";

function buildActorTypeGuidelines(actorType: ActorType): string {
  switch (actorType) {
    case "human":
      return `
ACTOR TYPE: HUMAN PERFORMER
- Write for a human actor who will perform on camera
- Include physical comedy, facial expressions, gestures
- Dialogue should feel natural and speakable
- Consider blocking and movement in the frame
- Props and interactions are fair game
`;
    case "ai_avatar":
      return `
ACTOR TYPE: AI AVATAR
- Content will be performed by an AI-generated avatar
- Focus on VISUAL GAGS and TEXT OVERLAYS (less dialogue-dependent)
- Exaggerated facial expressions work great
- Text overlays carry more weight than spoken word
- Keep dialogue simple and punchy (AI avatars have limitations)
- Suggest more on-screen text to enhance the comedy
- B-roll and quick cuts are your friends
`;
    case "voiceover":
      return `
ACTOR TYPE: VOICEOVER ONLY
- No on-camera performer - narration over footage
- Focus on NARRATION STYLE and RHYTHM
- B-roll heavy - describe visual suggestions in detail
- Dialogue is ALL voiceover, make it punchy and engaging
- Text overlays complement the narration
- Think documentary/essay style but funny
- Pacing through voice, not physical comedy
`;
    case "mixed":
      return `
ACTOR TYPE: MIXED (HUMAN + AI/VOICEOVER)
- Combination of human performer and AI elements
- Human appears on camera for key moments
- AI avatar or voiceover fills in other parts
- Clear distinction in beats: note which are [HUMAN] vs [AI/VO]
- Use each medium's strengths: human for authenticity, AI for effects
`;
    default:
      return "";
  }
}

// --- Dialogue Density Guidelines ---

function buildDialogueDensityGuidelines(density: number | null): string {
  if (!density) return '';

  switch (density) {
    case 1:
      return `
DIALOGUE DENSITY: MINIMAL (1/5) - "Show Don't Tell"
- Almost entirely visual storytelling
- Maybe 1-2 short spoken lines total
- Heavy reliance on on-screen text and visuals
- Actions and expressions tell the story
- Music/sound effects carry the emotion
- Think: silent film energy with modern text overlays
`;
    case 2:
      return `
DIALOGUE DENSITY: LIGHT (2/5) - "Visual First"
- Primarily visual with strategic dialogue
- Key punchlines get spoken, everything else is visual
- On-screen text for setup, dialogue for payoff
- 3-4 spoken lines maximum
- Let the visuals do most of the heavy lifting
`;
    case 3:
      return `
DIALOGUE DENSITY: BALANCED (3/5) - "Best of Both"
- Equal mix of dialogue and visual storytelling
- Dialogue drives key beats
- Actions/expressions punctuate between lines
- On-screen text enhances but doesn't replace dialogue
- Natural back-and-forth if multiple characters
`;
    case 4:
      return `
DIALOGUE DENSITY: DIALOGUE-DRIVEN (4/5) - "Talk It Out"
- Dialogue is the primary vehicle
- Most beats have spoken lines
- Narration and commentary carry the story
- Visual elements support the speech
- Good for storytelling and explanation-heavy content
`;
    case 5:
      return `
DIALOGUE DENSITY: DIALOGUE HEAVY (5/5) - "All Talk"
- Rapid-fire dialogue throughout
- Minimal pauses - words fill every beat
- Could work as audio-only if needed
- Think: rant style, stream of consciousness
- Energy comes from the speaker, not the visuals
`;
    default:
      return '';
  }
}

// --- Target Duration Guidelines ---

type TargetDuration = "quick" | "standard" | "extended" | "long";

function buildDurationGuidelines(duration: TargetDuration): string {
  switch (duration) {
    case "quick":
      return `
TARGET LENGTH: QUICK (15-20 seconds)
- Generate exactly 3-4 beats
- Ultra-tight pacing, every second counts
- Hook + 1-2 setup beats + CTA
- Perfect for attention-challenged scrollers
`;
    case "standard":
      return `
TARGET LENGTH: STANDARD (30-45 seconds)
- Generate exactly 5-6 beats
- Classic TikTok rhythm
- Hook + 3-4 story beats + CTA
- Room for one callback or twist
`;
    case "extended":
      return `
TARGET LENGTH: EXTENDED (45-60 seconds)
- Generate exactly 7-8 beats
- More room for character development
- Hook + 5-6 story beats + CTA
- Can include subplot or B-story
`;
    case "long":
      return `
TARGET LENGTH: LONG FORM (60-90 seconds)
- Generate exactly 9-12 beats
- Full narrative arc possible
- Hook + 7-10 story beats + CTA
- Multiple escalations, callbacks encouraged
- Consider chapter/act structure
`;
    default:
      return buildDurationGuidelines("standard");
  }
}

// --- Content Format Guidelines ---

type ContentFormat = "skit_dialogue" | "scene_montage" | "pov_story" | "product_demo_parody" | "reaction_commentary" | "day_in_life";

function buildContentFormatGuidelines(format: ContentFormat): string {
  switch (format) {
    case "skit_dialogue":
      return `
CONTENT FORMAT: SKIT/DIALOGUE
- Person-to-person comedy scenes with dialogue
- Natural back-and-forth conversation
- Character reactions and interactions drive the comedy
- Product appears organically in the scene
`;
    case "scene_montage":
      return `
CONTENT FORMAT: SCENE MONTAGE
- Series of visual scenes with voiceover narration
- Focus on DETAILED VISUAL/SETTING DESCRIPTIONS for each beat
- Include lighting/mood suggestions (warm, cold, dramatic, soft)
- Suggest camera angles: close-up, wide shot, tracking shot, POV
- Voiceover text should be SEPARATE from scene action in each beat
- B-roll heavy - describe exact shots needed
- Beat format should be:
  - action: "[SCENE: Location/setting description. Camera: angle. Lighting: mood]"
  - dialogue: "[VO] The voiceover script for this scene"
`;
    case "pov_story":
      return `
CONTENT FORMAT: POV STORY
- First-person perspective, natural/authentic feel
- Less "produced", more slice-of-life
- Write dialogue as internal monologue or talking to camera
- Situations feel real and relatable
- "POV: you when..." energy
- Product discovery should feel genuine, not staged
- Raw, unpolished aesthetic implied
`;
    case "product_demo_parody":
      return `
CONTENT FORMAT: PRODUCT DEMO PARODY
- Infomercial style with intentional comedy
- Exaggerated problems, over-the-top solutions
- Self-aware humor about advertising tropes
- "But wait, there's more!" energy
- Can include fake testimonials, dramatic before/afters
- Product as the hero that saves the day (ironically)
`;
    case "reaction_commentary":
      return `
CONTENT FORMAT: REACTION/COMMENTARY
- Reacting to something (video, trend, situation) with product tie-in
- Split focus: reaction content + product integration
- Commentary should be witty and engaging
- Product appears as natural part of the reaction setup
- "Okay but have you tried..." energy
`;
    case "day_in_life":
      return `
CONTENT FORMAT: DAY IN THE LIFE
- Following someone's routine from morning to night
- Product naturally integrated into daily moments
- Detailed scene descriptions for each beat:
  - Location (bedroom, kitchen, office, gym, etc.)
  - Time of day (morning light, afternoon sun, evening ambiance)
  - Camera suggestions (wide establishing, close-up details)
- Voiceover or minimal dialogue
- Cozy, aspirational, or relatable depending on tone
- Beat format should include:
  - action: "[TIME: 7:00am - Kitchen. Morning light through windows. Wide shot → close-up on coffee]"
  - dialogue: Optional narration or thought bubble
`;
    default:
      return buildContentFormatGuidelines("skit_dialogue");
  }
}

// --- Additional Creative Control Guidelines ---

function buildPacingGuidelines(pacing: string | null): string {
  if (!pacing) return "";
  switch (pacing) {
    case "slow":
      return `
PACING: SLOW BUILD
- Take time to develop the premise
- Build tension gradually
- Longer beats, more breathing room
- Viewer gets immersed in the story
`;
    case "moderate":
      return `
PACING: CONVERSATIONAL
- Natural talking pace
- Standard beat lengths
- Balanced rhythm of fast and slow moments
- Feels like a real conversation
`;
    case "fast":
      return `
PACING: QUICK CUTS
- Fast, punchy delivery
- Short beats, quick transitions
- High energy throughout
- Keep the viewer engaged with speed
`;
    case "rapid":
      return `
PACING: RAPID FIRE
- Maximum speed, constant motion
- Ultra-short beats (1-2 seconds each)
- No pauses, immediate cuts
- Overwhelming energy, ADHD-friendly
`;
    default:
      return "";
  }
}

function buildHookStrengthGuidelines(hookStrength: string | null): string {
  if (!hookStrength) return "";
  switch (hookStrength) {
    case "soft":
      return `
HOOK STYLE: SOFT OPEN
- Ease the viewer in gently
- Start with something relatable or curious
- Build interest gradually
- Less jarring, more inviting
`;
    case "standard":
      return `
HOOK STYLE: STANDARD HOOK
- Clear value proposition upfront
- Obvious reason to keep watching
- "Here's what you'll get" energy
- Reliable, proven format
`;
    case "strong":
      return `
HOOK STYLE: STRONG HOOK
- Immediate attention grab
- Start with the most interesting part
- Create instant curiosity or conflict
- "Wait, what?" in the first second
`;
    case "extreme":
      return `
HOOK STYLE: PATTERN INTERRUPT
- Shocking or unexpected opening
- Break all expectations
- Start mid-action or with something bizarre
- Maximum scroll-stopping power
- Examples: Start with the punchline, open on chaos, jarring visual
`;
    default:
      return "";
  }
}

function buildAuthenticityGuidelines(authenticity: string | null): string {
  if (!authenticity) return "";
  switch (authenticity) {
    case "polished":
      return `
AUTHENTICITY: POLISHED
- Professional, scripted feel
- Clear enunciation, rehearsed delivery
- High production value vibe
- Brand-safe, corporate-friendly
`;
    case "balanced":
      return `
AUTHENTICITY: BALANCED
- Professional but natural
- Slight imperfections are OK
- Feels prepared but not robotic
- Trustworthy and competent
`;
    case "casual":
      return `
AUTHENTICITY: CASUAL
- Feels like talking to a friend
- Natural speech patterns, some "ums"
- Relaxed, approachable energy
- Like a genuine recommendation
`;
    case "raw":
      return `
AUTHENTICITY: RAW/UGC
- Completely unfiltered
- Looks homemade, feels real
- Stream of consciousness allowed
- Maximum authenticity, minimum polish
- This should feel like a real person discovered something, not an ad
`;
    default:
      return "";
  }
}

function buildPresentationStyleGuidelines(style: string | null): string {
  if (!style) return "";
  const styles: Record<string, string> = {
    direct_pitch: `
PRESENTATION: STRAIGHT SELL
- Direct product pitch approach
- Clear benefits, direct CTA
- No beating around the bush
- "This product does X, here's why you need it"
`,
    storytelling: `
PRESENTATION: STORY TIME
- Narrative-driven content
- Beginning, middle, end structure
- Character goes through transformation
- Product is part of the story arc
`,
    problem_solution: `
PRESENTATION: PROBLEM → SOLUTION
- Classic pain point format
- Establish the problem dramatically
- Show the struggle
- Product saves the day
`,
    demonstration: `
PRESENTATION: SHOW DON'T TELL
- Product in action
- Visual proof of benefits
- Less talking, more showing
- Let the product speak for itself
`,
    testimonial: `
PRESENTATION: REAL TALK
- Testimonial/review style
- Personal experience focus
- "Here's what happened when I tried it"
- Authentic recommendation energy
`,
    comparison: `
PRESENTATION: SIDE BY SIDE
- Comparison format
- Before/after or us/them
- Clear contrast between options
- Product is obviously the winner
`,
    tutorial: `
PRESENTATION: HOW TO
- Educational/tutorial format
- Step-by-step guidance
- Teach something valuable
- Product is the tool for success
`,
    unboxing: `
PRESENTATION: FIRST LOOK
- Unboxing/reveal style
- Build anticipation
- Discovery and reaction moments
- First impressions focus
`,
    day_in_life: `
PRESENTATION: DAY IN MY LIFE
- Lifestyle integration format
- Product woven into daily routine
- Natural, organic placement
- Aspirational but relatable
`,
    trending: `
PRESENTATION: TREND JACKING
- Uses current TikTok trends
- Format/sound/meme reference
- Familiar structure with product twist
- Leverage existing virality
`,
  };
  return styles[style] || "";
}

// --- Main API Handler ---

export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth check
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Rate limiting (heavy AI generation - 5 req/min)
  const rateLimitResponse = enforceRateLimits(
    { userId: authContext.user.id, ...extractRateLimitContext(request) },
    correlationId,
    { userLimit: 5 }
  );
  if (rateLimitResponse) return rateLimitResponse;

  // Admin bypass: Admins don't need credits
  let creditResult: { success: boolean; credits_remaining: number }[] | null = null;
  if (!authContext.isAdmin) {
    // Check and deduct credit BEFORE generating (non-admins only)
    const { data, error: creditError } = await supabaseAdmin.rpc("deduct_credit", {
      p_user_id: authContext.user.id,
      p_description: "Skit generation",
    });
    creditResult = data;

    if (creditError) {
      console.error(`[${correlationId}] Credit deduction error:`, creditError);
      // Continue anyway for now - don't block on credit system errors
    } else {
      const result = data?.[0];
      if (result && !result.success) {
        return NextResponse.json({
          ok: false,
          error: "No credits remaining",
          creditsRemaining: result.credits_remaining || 0,
          correlation_id: correlationId,
        }, { status: 402 });
      }
    }
  }

  // Parse and validate input
  let input: GenerateSkitInput;
  try {
    const body = await request.json();
    input = GenerateSkitInputSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Build a user-friendly error message listing all validation issues
      const issueMessages = err.issues.map((i) => {
        const field = i.path.join(".") || "request";
        return `${field}: ${i.message}`;
      });
      const friendlyMessage = `Validation failed: ${issueMessages.join("; ")}`;
      console.error(`[${correlationId}] Validation error:`, friendlyMessage);
      return createApiErrorResponse("VALIDATION_ERROR", friendlyMessage, 400, correlationId, {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    console.error(`[${correlationId}] JSON parse error:`, err);
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  // Note: All authenticated users can request any tier and intensity.
  // Safety is enforced by deterministic sanitization + risk scoring + auto-downgrade.
  // Intensity is soft-throttled via budget to prevent abuse at scale.

  // Check debug mode early for conditional diagnostics
  const debugMode = isDebugMode(request);

  try {
    // Fetch product info if product_id provided, otherwise use fallback product_name
    let product: { id: string | null; name: string; brand: string | null; brand_id: string | null; category: string | null; notes: string | null; pain_points: PainPoint[] | null } | null = null;

    // Debug info collected during product lookup
    let productLookupDebug: Record<string, unknown> | null = null;

    if (input.product_id) {
      const productIdReceived = input.product_id;
      const productIdTrimmed = input.product_id.trim();

      // Fetch sample product IDs for comparison (debug only)
      let sampleProductIds: string[] = [];
      if (debugMode) {
        const { data: sampleProducts } = await supabaseAdmin
          .from("products")
          .select("id")
          .limit(3);
        sampleProductIds = sampleProducts?.map((p: { id: string }) => p.id) || [];
      }

      // Build debug info
      productLookupDebug = {
        product_id_received: productIdReceived,
        product_id_received_typeof: typeof productIdReceived,
        product_id_received_length: productIdReceived.length,
        product_id_trimmed: productIdTrimmed,
        product_id_trimmed_length: productIdTrimmed.length,
        sample_product_ids: sampleProductIds,
        query_attempted: {
          table: "products",
          select: "id, name, brand, brand_id, category, notes",
          filter: { column: "id", operator: "eq", value: productIdTrimmed },
          method: "single",
        },
      };

      // Log to console for terminal visibility (debug mode only)
      if (debugMode) {
        console.log(`[${correlationId}] Product lookup debug:`, JSON.stringify(productLookupDebug, null, 2));
      }

      // Fetch product using SERVICE ROLE client (bypasses RLS)
      const { data: dbProduct, error: productError } = await supabaseAdmin
        .from("products")
        .select("id, name, brand, brand_id, category, notes, pain_points")
        .eq("id", productIdTrimmed)
        .single();

      // Add query result to debug info
      productLookupDebug.query_result = {
        found: !!dbProduct && !productError,
        error_code: productError?.code || null,
        error_message: productError?.message || null,
        row_returned: dbProduct ? { id: dbProduct.id, name: dbProduct.name } : null,
      };

      // Distinguish error types:
      // - PGRST116: query succeeded but returned 0 rows (not found)
      // - Other errors: database/network issues
      if (productError) {
        const isNotFoundError = productError.code === "PGRST116";

        if (isNotFoundError) {
          return createApiErrorResponse(
            "PRODUCT_NOT_FOUND",
            "Product not found",
            404,
            correlationId,
            {
              product_id: input.product_id,
              ...(debugMode ? { debug: productLookupDebug } : {}),
            }
          );
        }

        // Actual database error
        console.error(`[${correlationId}] Product lookup DB error:`, productError);
        return createApiErrorResponse(
          "DB_ERROR",
          "Failed to fetch product",
          500,
          correlationId,
          {
            product_id: input.product_id,
            ...(debugMode ? { debug: productLookupDebug } : {}),
          }
        );
      }

      if (!dbProduct) {
        // Should not happen after error check, but defensive
        return createApiErrorResponse(
          "PRODUCT_NOT_FOUND",
          "Product not found",
          404,
          correlationId,
          {
            product_id: input.product_id,
            ...(debugMode ? { debug: productLookupDebug } : {}),
          }
        );
      }

      product = dbProduct;
    } else {
      // No product_id - use product_name fallback (standalone tool mode)
      // product_name is validated by Zod (min length 3)
      product = {
        id: null,
        name: input.product_name || "the product",
        brand: input.brand_name || null,
        brand_id: null,
        category: null,
        notes: null,
        pain_points: null,
      };
    }

    // Fetch brand context if product has a brand_id
    let brandContextPrompt = '';
    if (product?.brand_id) {
      const brandContext = await fetchBrandContext(product.brand_id);
      brandContextPrompt = buildBrandContextPrompt(brandContext);
    }

    // Build pain points prompt section if product has pain points
    const painPointsPrompt = buildPainPointsPrompt(product?.pain_points);

    // Look up preset if provided
    let preset: SkitPreset | null = null;
    let presetIntensityClamped = false;
    if (input.preset_id) {
      preset = getSkitPreset(input.preset_id);
      if (!preset) {
        return createApiErrorResponse("VALIDATION_ERROR", `Unknown preset: ${input.preset_id}`, 400, correlationId);
      }
    }

    // Look up template - use preset default if no template specified
    let template: SkitTemplate | null = null;
    const effectiveTemplateId = input.template_id || preset?.default_template_id;
    if (effectiveTemplateId) {
      template = getSkitTemplate(effectiveTemplateId);
      if (!template) {
        return createApiErrorResponse("VALIDATION_ERROR", `Unknown template: ${effectiveTemplateId}`, 400, correlationId);
      }
    }

    // Get intensity - apply preset clamping first, then budget throttle
    let requestedIntensity = input.intensity ?? preset?.intensity_default ?? 50;
    const originalRequestedIntensity = input.intensity ?? preset?.intensity_default ?? 50;
    if (preset) {
      const presetClamp = clampIntensityToPreset(requestedIntensity, preset);
      if (presetClamp.wasClamped) {
        presetIntensityClamped = true;
        requestedIntensity = presetClamp.intensity;
      }
    }

    // Check intensity budget (soft throttle - clamps instead of blocking)
    // Cost is based on original requested intensity (user intent) to prevent spam at high values
    const intensityBudget = await applySkitBudgetClamp({
      supabase: supabaseAdmin,
      orgId: "default", // org_id not available in auth context, use default bucket
      userId: authContext.user.id,
      intensityRequested: originalRequestedIntensity,
      correlationId,
    });

    // Apply budget clamp on top of preset clamp
    if (intensityBudget.budgetClamped) {
      requestedIntensity = intensityBudget.intensityApplied;
    }

    // Fetch audience persona if provided
    let audiencePersona: AudiencePersona | null = null;
    if (input.audience_persona_id) {
      const { data: personaData, error: personaError } = await supabaseAdmin
        .from("audience_personas")
        .select("*")
        .eq("id", input.audience_persona_id)
        .single();

      if (!personaError && personaData) {
        audiencePersona = personaData as AudiencePersona;
        // Increment usage count
        await supabaseAdmin
          .from("audience_personas")
          .update({ times_used: (audiencePersona.times_used || 0) + 1 })
          .eq("id", input.audience_persona_id);
      }
    }

    // Fetch pain point if provided
    let painPoint: PainPointData | null = null;
    if (input.pain_point_id) {
      const { data: ppData, error: ppError } = await supabaseAdmin
        .from("pain_points")
        .select("*")
        .eq("id", input.pain_point_id)
        .single();

      if (!ppError && ppData) {
        painPoint = ppData as PainPointData;
        // Increment usage count
        await supabaseAdmin
          .from("pain_points")
          .update({ times_used: (painPoint.times_used || 0) + 1 })
          .eq("id", input.pain_point_id);
      }
    }

    // Fetch Winners Bank Intelligence
    let winnersIntelligence: WinnersIntelligence | null = null;
    let winnerVariation: Winner | null = null;

    // If generating variation of specific winner (now uses winners_bank)
    if (input.winner_id) {
      const { winner: winnerData, error: winnerError } = await fetchWinnerById(
        input.winner_id,
        authContext.user.id
      );

      if (!winnerError && winnerData) {
        winnerVariation = winnerData;
      }
    }

    // Fetch user's winners for pattern analysis (now uses winners_bank)
    if (input.use_winners_intelligence && !winnerVariation) {
      winnersIntelligence = await fetchWinnersIntelligence(authContext.user.id);
    }

    // Build the prompt
    const productName = input.product_display_name || product.name || "the product";
    const ctaOverlay = input.cta_overlay || "Link in bio!";

    // Look up creator persona if specified
    const creatorPersona = input.creator_persona_id
      ? getPersonaById(input.creator_persona_id)
      : null;

    // Enforce duration by content type:
    // BOF = always quick (10-15s), slideshow_story = always extended (45-60s)
    let effectiveDuration: TargetDuration = input.target_duration ?? "standard";
    if (input.content_type_id === "bof") {
      effectiveDuration = "quick";
    } else if (input.content_type_id === "slideshow_story") {
      effectiveDuration = input.target_duration ?? "extended";
    }

    const prompt = buildSkitPrompt({
      productName,
      brandName: product.brand || "",
      category: product.category || "",
      description: product.notes || "",
      ctaOverlay,
      riskTier: input.risk_tier,
      persona: input.persona,
      creatorPersona: creatorPersona || null,
      template,
      preset,
      intensity: requestedIntensity,
      plotStyle: input.chaos_level ?? input.plot_style ?? 50,
      creativeDirection: input.creative_direction || "",
      actorType: input.actor_type ?? "human",
      targetDuration: effectiveDuration,
      contentFormat: input.content_format ?? "skit_dialogue",
      productContext: input.product_context || "",
      pacing: input.pacing ?? null,
      hookStrength: input.hook_strength ?? null,
      authenticity: input.authenticity ?? null,
      presentationStyle: input.presentation_style ?? null,
      dialogueDensity: input.dialogue_density ?? null,
      audiencePersona,
      painPoint,
      painPointFocus: input.pain_point_focus || [],
      useAudienceLanguage: input.use_audience_language ?? true,
      winnersIntelligence,
      winnerVariation,
      brandContextPrompt,
      painPointsPrompt,
      contentTypeId: input.content_type_id || null,
      contentSubtypeId: input.content_subtype_id || null,
    });

    // Determine variation count (default 3)
    const variationCount = input.variation_count ?? 3;

    // Generate multiple variations in parallel with different creative seeds
    const variationPromises = Array.from({ length: variationCount }, (_, i) =>
      generateSingleVariation(prompt, i, variationCount, correlationId)
    );

    const variationResults = await Promise.all(variationPromises);

    // Filter out failed generations
    const successfulVariations = variationResults.filter((v): v is Skit => v !== null);

    if (successfulVariations.length === 0) {
      return createApiErrorResponse("AI_ERROR", "Failed to generate any skit variations", 500, correlationId);
    }

    // Post-process and score all variations in parallel
    const processedVariations = await Promise.all(
      successfulVariations.map(async (rawSkit, idx) => {
        const processed = postProcessSkit(rawSkit, input.risk_tier);

        // Validate against template if used
        let templateValidation: { valid: boolean; issues: string[] } | null = null;
        if (template) {
          templateValidation = validateSkitAgainstTemplate(processed.skit, template);
        }

        // Score the variation
        let aiScore: AIScoreResult | null = null;
        try {
          aiScore = await scoreSkitInternal(processed.skit, productName, product.brand || undefined, `${correlationId}-v${idx}`);
        } catch (scoreError) {
          console.error(`[${correlationId}] Variation ${idx} scoring failed:`, scoreError);
        }

        return {
          skit: processed.skit,
          ai_score: aiScore,
          risk_tier_applied: processed.appliedTier,
          risk_score: processed.riskScore,
          risk_flags: processed.riskFlags,
          template_validation: templateValidation,
        };
      })
    );

    // Sort by overall score (best first), null scores go last
    const sortedVariations = processedVariations.sort((a, b) => {
      const scoreA = a.ai_score?.overall_score ?? 0;
      const scoreB = b.ai_score?.overall_score ?? 0;
      return scoreB - scoreA;
    });

    // Determine entity type/id for audit: video > product > system
    const auditEntityType = input.video_id ? "video" : input.product_id ? "product" : "system";
    const auditEntityId = input.video_id || input.product_id || authContext.user.id;

    // Audit log
    auditLogAsync({
      correlation_id: correlationId,
      event_type: "ai.skit_generated",
      entity_type: auditEntityType,
      entity_id: auditEntityId,
      actor: authContext.user.id,
      summary: `${sortedVariations.length} skit variations generated: ${input.risk_tier}, persona=${input.persona}, intensity=${requestedIntensity}`,
      details: {
        risk_tier_requested: input.risk_tier,
        persona: input.persona,
        template_id: effectiveTemplateId || null,
        preset_id: preset?.id || null,
        preset_name: preset?.name || null,
        product_id: input.product_id || null,
        product_name: product.name,
        variation_count: sortedVariations.length,
        variation_scores: sortedVariations.map(v => v.ai_score?.overall_score ?? null),
        intensity_requested: originalRequestedIntensity,
        intensity_applied: requestedIntensity,
        budget_clamped: intensityBudget.budgetClamped,
        preset_intensity_clamped: presetIntensityClamped,
        ...(debugMode ? { budget_diagnostics: intensityBudget.diagnostics } : {}),
      },
    });

    // Build audience metadata
    const audienceMetadata = {
      persona_id: audiencePersona?.id || null,
      persona_name: audiencePersona?.name || null,
      persona_tone: audiencePersona?.tone_preference || audiencePersona?.tone || null,
      pain_points_targeted: input.pain_point_focus?.length ? input.pain_point_focus : null,
      pain_point_mode: input.pain_point_focus?.length ? 'user_selected' : (audiencePersona ? 'ai_chosen' : null),
    };

    // Build response data
    const responseData: Record<string, unknown> = {
      variations: sortedVariations,
      variation_count: sortedVariations.length,
      template_id: effectiveTemplateId || null,
      preset_id: preset?.id || null,
      preset_name: preset?.name || null,
      intensity_requested: originalRequestedIntensity,
      intensity_applied: requestedIntensity,
      budget_clamped: intensityBudget.budgetClamped,
      preset_intensity_clamped: presetIntensityClamped,
      // Audience Intelligence metadata
      audience_metadata: audienceMetadata,
      // Legacy single-skit fields for backward compatibility (best variation)
      skit: sortedVariations[0].skit,
      ai_score: sortedVariations[0].ai_score,
      risk_tier_applied: sortedVariations[0].risk_tier_applied,
      risk_score: sortedVariations[0].risk_score,
      risk_flags: sortedVariations[0].risk_flags,
      template_validation: sortedVariations[0].template_validation,
    };

    // Include diagnostics only in debug mode
    if (debugMode) {
      responseData.budget_diagnostics = intensityBudget.diagnostics;
      if (productLookupDebug) {
        responseData.product_lookup_debug = productLookupDebug;
      }
    }

    // Get remaining credits for response
    const creditsRemaining = creditResult?.[0]?.credits_remaining;

    // Success response
    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: responseData,
      ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;

  } catch (error) {
    console.error(`[${correlationId}] Skit generation error:`, error);

    // Refund credit on AI failure (non-admins only)
    if (!authContext.isAdmin) {
      try {
        await supabaseAdmin.rpc("add_credits", {
          p_user_id: authContext.user.id,
          p_amount: 1,
          p_description: "Refund: generation failed",
          p_type: "refund",
        });
      } catch (refundErr) {
        console.error(`[${correlationId}] Credit refund failed:`, refundErr);
      }
    }

    const message = error instanceof Error && error.name === "AbortError"
      ? "Generation timed out. Please try again."
      : error instanceof Error ? error.message : "Skit generation failed";

    return createApiErrorResponse(
      "AI_ERROR",
      message,
      500,
      correlationId
    );
  }
}

// --- Prompt Builder ---

interface PromptParams {
  productName: string;
  brandName: string;
  category: string;
  description: string;
  ctaOverlay: string;
  riskTier: RiskTier;
  persona: Persona;
  creatorPersona: CreatorPersona | null;
  template: SkitTemplate | null;
  preset: SkitPreset | null;
  intensity: number;
  plotStyle: number;
  creativeDirection: string;
  actorType: ActorType;
  targetDuration: TargetDuration;
  contentFormat: ContentFormat;
  productContext: string;
  // Additional creative controls
  pacing: string | null;
  hookStrength: string | null;
  authenticity: string | null;
  presentationStyle: string | null;
  dialogueDensity: number | null;
  // Audience Intelligence
  audiencePersona: AudiencePersona | null;
  painPoint: PainPointData | null;
  painPointFocus: string[];  // Specific pain points selected by user
  useAudienceLanguage: boolean;
  // Winners Bank Intelligence
  winnersIntelligence: WinnersIntelligence | null;
  winnerVariation: Winner | null; // If generating variation of specific winner
  // Brand Context
  brandContextPrompt: string;
  // Product Pain Points
  painPointsPrompt: string;
  // Content type identification (drives prompt framing)
  contentTypeId: string | null;
  contentSubtypeId: string | null;
}

function buildSkitPrompt(params: PromptParams): string {
  const { productName, brandName, category, description, ctaOverlay, riskTier, persona, creatorPersona, template, preset, intensity, plotStyle, creativeDirection, actorType, targetDuration, contentFormat, productContext, pacing, hookStrength, authenticity, presentationStyle, dialogueDensity, audiencePersona, painPoint, painPointFocus, useAudienceLanguage, winnersIntelligence, winnerVariation, brandContextPrompt, painPointsPrompt, contentTypeId, contentSubtypeId } = params;

  // Get content-type-aware prompt config (defaults to skit if unset)
  const formatConfig = getOutputFormatConfig(contentTypeId, contentSubtypeId);

  // Use new creator persona system if available, otherwise fall back to legacy personas
  const personaGuideline = creatorPersona
    ? buildPersonaPromptSection(creatorPersona)
    : PERSONA_GUIDELINES[persona];
  const tierGuideline = TIER_GUIDELINES[riskTier];
  const templateSection = template ? buildTemplatePromptSection(template) : "";
  const presetSection = preset ? buildPresetPromptSection(preset) : "";
  const intensityGuideline = buildIntensityGuidelines(intensity);
  const plotStyleGuideline = buildPlotStyleGuidelines(plotStyle);
  const actorGuideline = buildActorTypeGuidelines(actorType);
  const durationGuideline = buildDurationGuidelines(targetDuration);
  const contentFormatGuideline = buildContentFormatGuidelines(contentFormat);
  const pacingGuideline = buildPacingGuidelines(pacing);
  const hookStrengthGuideline = buildHookStrengthGuidelines(hookStrength);
  const authenticityGuideline = buildAuthenticityGuidelines(authenticity);
  const presentationStyleGuideline = buildPresentationStyleGuidelines(presentationStyle);
  const dialogueDensityGuideline = buildDialogueDensityGuidelines(dialogueDensity);
  const audienceContext = buildAudienceContext(audiencePersona, painPoint, painPointFocus, useAudienceLanguage);
  const winnersContext = buildWinnersContext(winnersIntelligence);
  const winnerVariationSection = winnerVariation ? buildWinnerVariationPrompt(winnerVariation) : "";
  const creativeDirectionSection = creativeDirection
    ? `\nCREATIVE DIRECTION FROM USER:\n"${creativeDirection}"\n(Incorporate this vibe/style into the script)\n`
    : "";
  const productContextSection = productContext
    ? `\nADDITIONAL PRODUCT INFORMATION:\n${productContext}\n(Use these details to make the product integration more specific and compelling)\n`
    : "";

  return `${formatConfig.systemIdentity}

${formatConfig.characterConstraints}

${formatConfig.creativePrinciples}

${HUMAN_VOICE_INSTRUCTIONS}

PRODUCT INFO:
- Product Name: ${productName}
- Brand: ${brandName || "N/A"}
- Category: ${category || "General"}
- Notes: ${description || "None provided"}
${productContextSection}
CTA OVERLAY TO USE: "${ctaOverlay}"
${creativeDirectionSection}
${winnerVariationSection}
${winnersContext}
${audienceContext}
${brandContextPrompt}
${painPointsPrompt}
${contentFormatGuideline}

${actorGuideline}

${durationGuideline}

${plotStyleGuideline}
${pacingGuideline}
${hookStrengthGuideline}
${authenticityGuideline}
${presentationStyleGuideline}
${dialogueDensityGuideline}

${tierGuideline}

${intensityGuideline}

${presetSection}

PERSONA/CHARACTER:
${personaGuideline}

${templateSection}

${COMPLIANCE_REMINDER}

${CTA_INSTRUCTIONS}

${formatConfig.structureTemplate}

${BROLL_INSTRUCTIONS}

Generate a creative, compliant script now. Output ONLY valid JSON, no explanation.`;
}

// --- Variation Generation ---

const VARIATION_APPROACHES = [
  "Use a CONVERSATIONAL/DIALOGUE-HEAVY approach. Focus on witty back-and-forth exchanges.",
  "Use a VISUAL/PHYSICAL COMEDY approach. Focus on actions, reactions, and visual gags over dialogue.",
  "Use a STORYTELLING/NARRATIVE approach. Build a mini-arc with setup, escalation, and payoff.",
  "Use an ABSURDIST/SURREAL approach. Lean into unexpected turns and fever-dream logic.",
  "Use a RELATABLE/SLICE-OF-LIFE approach. Focus on universal frustrations and 'this is so me' moments.",
];

async function generateSingleVariation(
  basePrompt: string,
  variationIndex: number,
  totalVariations: number,
  correlationId: string
): Promise<Skit | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[${correlationId}] ANTHROPIC_API_KEY not configured`);
    throw new Error("AI service not configured");
  }

  // Add variation-specific instructions to encourage distinct approaches
  const variationInstruction = totalVariations > 1
    ? `\n\nVARIATION INSTRUCTION: This is variation ${variationIndex + 1} of ${totalVariations}.
${VARIATION_APPROACHES[variationIndex % VARIATION_APPROACHES.length]}
Make this skit DISTINCTLY DIFFERENT from other variations - don't just change words, change the creative approach, hook style, and comedic angle.\n`
    : "";

  const prompt = basePrompt + variationInstruction;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${correlationId}] Variation ${variationIndex} API error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    console.error(`[${correlationId}] No content for variation ${variationIndex}`);
    return null;
  }

  try {
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());

    if (!validateSkitStructure(parsed)) {
      console.error(`[${correlationId}] Invalid structure for variation ${variationIndex}`);
      return null;
    }

    return parsed as Skit;
  } catch (parseErr) {
    console.error(`[${correlationId}] Failed to parse variation ${variationIndex}:`, parseErr);
    return null;
  }
}

// --- AI Score Types and Functions ---

interface AIScoreResult {
  hook_strength: number;
  humor_level: number;
  product_integration: number;
  virality_potential: number;
  clarity: number;
  production_feasibility: number;
  overall_score: number;
  strengths: string[];
  improvements: string[];
}

function buildScoringPrompt(skit: Skit, productName: string, productBrand?: string): string {
  const productDesc = productBrand ? `${productBrand} ${productName}` : productName;

  const skitText = `
HOOK: "${skit.hook_line}"

BEATS:
${skit.beats.map((beat, i) => `${i + 1}. [${beat.t}] ${beat.action}${beat.dialogue ? `\n   Dialogue: "${beat.dialogue}"` : ''}${beat.on_screen_text ? `\n   Text: "${beat.on_screen_text}"` : ''}`).join('\n\n')}

CTA: "${skit.cta_line}"
CTA Overlay: "${skit.cta_overlay}"

B-ROLL SUGGESTIONS:
${skit.b_roll.map((b, i) => `${i + 1}. ${b}`).join('\n')}

OVERLAYS:
${skit.overlays.map((o, i) => `${i + 1}. ${o}`).join('\n')}
`.trim();

  return `You are a TikTok content strategist evaluating short-form video scripts. Score this skit for a "${productDesc}" product. Be critical but constructive.

THE SKIT TO EVALUATE:
${skitText}

EVALUATION CRITERIA (score each 1-10):

1. HOOK STRENGTH: How attention-grabbing is the opening? Will it stop the scroll in the first 1-2 seconds?
   - 1-3: Generic, forgettable, wouldn't make someone pause
   - 4-6: Decent but predictable, might get a glance
   - 7-8: Strong pattern interrupt, creates curiosity
   - 9-10: Exceptional, guaranteed scroll-stopper

2. HUMOR LEVEL: How funny/entertaining is the content?
   - 1-3: Flat, cringey, or trying too hard
   - 4-6: Has moments, but not memorable
   - 7-8: Genuinely funny, would share with friends
   - 9-10: Comedy gold, quotable moments

3. PRODUCT INTEGRATION: How naturally is the product woven in? (not salesy)
   - 1-3: Feels like a forced ad, product mention is jarring
   - 4-6: Product is there but feels shoehorned
   - 7-8: Natural integration, product feels like part of the story
   - 9-10: You forget it's an ad, product is the hero organically

4. VIRALITY POTENTIAL: How shareable/relatable is this? Would people tag friends?
   - 1-3: No rewatch value, wouldn't share
   - 4-6: Some people might relate, limited appeal
   - 7-8: Highly relatable, people will tag friends
   - 9-10: "OMG this is literally me" energy, guaranteed shares

5. CLARITY: Is the message clear? Easy to follow?
   - 1-3: Confusing, hard to follow, too many ideas
   - 4-6: Gets the point across but messy
   - 7-8: Clear narrative, easy to follow
   - 9-10: Crystal clear, every beat lands perfectly

6. PRODUCTION FEASIBILITY: How easy is this to actually film?
   - 1-3: Would require major budget, complex setups, CGI
   - 4-6: Needs some planning and resources
   - 7-8: Achievable with basic equipment and planning
   - 9-10: Can shoot this with a phone in an afternoon

OVERALL SCORE: Weighted average emphasizing hook (25%), humor (20%), product integration (20%), virality (20%), clarity (10%), feasibility (5%).

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "hook_strength": <1-10>,
  "humor_level": <1-10>,
  "product_integration": <1-10>,
  "virality_potential": <1-10>,
  "clarity": <1-10>,
  "production_feasibility": <1-10>,
  "overall_score": <1-10>,
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "improvements": ["actionable improvement 1", "actionable improvement 2", "actionable improvement 3"]
}

IMPORTANT:
- Be honest and critical. Average skits should score 5-6. Only exceptional work gets 8+.
- Strengths should be SPECIFIC to this skit, not generic praise.
- Improvements should be ACTIONABLE, not vague.
- Each array should have 2-3 items, no more.`;
}

async function scoreSkitInternal(skit: Skit, productName: string, productBrand: string | undefined, correlationId: string): Promise<AIScoreResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[${correlationId}] ANTHROPIC_API_KEY not configured for scoring`);
    return null;
  }

  const prompt = buildScoringPrompt(skit, productName, productBrand);

  const scoreController = new AbortController();
  const scoreTimeout = setTimeout(() => scoreController.abort(), 30000); // 30s timeout for scoring

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: scoreController.signal,
    });
  } catch (err) {
    clearTimeout(scoreTimeout);
    console.error(`[${correlationId}] Scoring timeout or network error:`, err);
    return null;
  } finally {
    clearTimeout(scoreTimeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${correlationId}] Anthropic API scoring error: ${response.status} - ${errorText}`);
    return null;
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    console.error(`[${correlationId}] No scoring content from Anthropic`);
    return null;
  }

  try {
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim()) as AIScoreResult;

    // Basic validation
    const numberFields = ['hook_strength', 'humor_level', 'product_integration', 'virality_potential', 'clarity', 'production_feasibility', 'overall_score'];
    for (const field of numberFields) {
      const val = parsed[field as keyof AIScoreResult];
      if (typeof val !== 'number' || val < 1 || val > 10) {
        console.error(`[${correlationId}] Invalid score field ${field}: ${val}`);
        return null;
      }
    }

    if (!Array.isArray(parsed.strengths) || !Array.isArray(parsed.improvements)) {
      console.error(`[${correlationId}] Missing strengths/improvements arrays`);
      return null;
    }

    return parsed;
  } catch (parseErr) {
    console.error(`[${correlationId}] Failed to parse score JSON:`, parseErr);
    return null;
  }
}
