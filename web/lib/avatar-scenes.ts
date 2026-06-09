/**
 * Avatar Scene Library — preset hyperrealistic environments for AI avatars.
 *
 * Why this exists: a bare-background HeyGen photo avatar reads as "AI demo."
 * A scene-grounded avatar reads as "real influencer speaking at a real
 * place" — convention, cafe, kitchen, gym, retail aisle. That's the
 * difference between $0/mo and $10K/mo on the AICreatorLab playbook.
 *
 * Flow:
 *   1. User uploads their face photo (avatar_visual_reference_url)
 *   2. User picks a Scene from this library (or supplies a custom prompt)
 *   3. POST /api/avatars/[id]/scene/generate
 *        → calls Gemini 2.5 Flash Image (Nano Banana Pro)
 *        → blends the face into the scene
 *        → stores public URL in brand_profiles.scene_image_url
 *   4. POST /api/avatars/[id]/heygen/register-photo
 *        → uses scene_image_url instead of avatar_visual_reference_url
 *        → HeyGen registers + animates the scene-grounded face
 *   5. Every render now shows the avatar IN their scene context
 *
 * Prompt design notes:
 *   - Every prompt opens with "hyperrealistic" — Gemini weighs this strongly
 *   - Each describes ENVIRONMENT first, then SUBJECT, then LIGHTING
 *   - We keep camera direction ("looking directly at camera, mid-shot")
 *     because HeyGen lip-sync needs the face clearly forward-facing
 *   - "Preserve the subject's exact face, age, ethnicity, hair, beard"
 *     reminds Gemini this is image-conditioned generation, not text-to-image
 */

export interface AvatarScene {
  /** Stable key — stored on brand_profiles.scene_preset. Never rename. */
  key: string;
  /** Display name shown in /avatars/new picker */
  name: string;
  /** Short subtitle on the picker card */
  subtitle: string;
  /** Which niche this scene sells for */
  bestFor: string;
  /** Emoji/icon — keeps card visually scannable without thumbnails */
  emoji: string;
  /**
   * The Gemini Nano Banana prompt. Uses image-conditioned generation —
   * Gemini gets the user's face photo AS A REFERENCE IMAGE and applies this
   * prompt to recompose them in the scene while preserving identity.
   */
  geminiPrompt: string;
  /** Brand color theme for the card border */
  accent: 'teal' | 'amber' | 'rose' | 'purple' | 'blue' | 'emerald' | 'orange';
}

const FACE_PRESERVATION =
  'Preserve the exact face, age, ethnicity, hair, beard, and bone structure of the subject in the reference image. ' +
  'The subject must look directly at the camera, mid-shot, head and shoulders framed clearly. ' +
  'The mouth area must be unobstructed and well-lit so lip-sync animation will work later.';

const QUALITY_PREFIX =
  'Hyperrealistic photo. Shot on a Sony A7 IV, 50mm, f/1.8. ' +
  'Natural skin texture, real pore detail, no waxy AI-look, no glossy plastic skin. ' +
  'Sharp focus on the eyes. Cinematic but believable lighting. ';

export const AVATAR_SCENES: AvatarScene[] = [
  {
    key: 'convention_speaker',
    name: 'Convention Speaker',
    subtitle: 'On stage at a tech / SaaS conference',
    bestFor: 'B2B SaaS, founder content, tech keynotes',
    emoji: '🎤',
    accent: 'teal',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject is on a large modern conference stage, mid-keynote. ' +
      'Behind them is a softly blurred giant LED wall showing abstract product graphics in cool blue and white. ' +
      'A few hundred audience heads are subtly visible in the foreground, softly out of focus. ' +
      'A lavalier mic clipped to their shirt collar. Professional event lighting (warm key light, cool blue rim). ' +
      'Confident posture. The subject is mid-gesture — not posing. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'studio_podcast',
    name: 'Studio Podcast Host',
    subtitle: 'Behind a Shure SM7B in a warm-lit studio',
    bestFor: 'Coaching, finance, education, authority content',
    emoji: '🎙️',
    accent: 'amber',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject sits in a high-end podcast studio behind a Shure SM7B microphone on a boom arm. ' +
      'Warm tungsten lighting. Acoustic foam panels and a few framed records on the wall behind them, softly out of focus. ' +
      'Wearing headphones (Audio-Technica style). ' +
      'A laptop screen glows softly off-camera left. ' +
      'The subject leans slightly forward, engaged, like they are mid-conversation. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'home_kitchen',
    name: 'Home Kitchen Explainer',
    subtitle: 'Modern home kitchen, midday natural light',
    bestFor: 'Food, supplements, kitchen gadgets, lifestyle TikTok Shop',
    emoji: '🍳',
    accent: 'orange',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject stands at a clean modern kitchen island, midday natural light through a window behind them (soft backlight). ' +
      'Marble countertop. A few fresh ingredients (lemon, fresh herbs, a wooden cutting board) softly visible on the counter. ' +
      'Stainless appliances out of focus. ' +
      'They are wearing a clean casual top (white tee or light sweater). ' +
      'Hands resting on the counter, body language relaxed and welcoming. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'cafe_casual',
    name: 'Cafe Casual',
    subtitle: 'Cozy boutique coffee shop, latte on the table',
    bestFor: 'Lifestyle, productivity, gen-Z talking-to-camera content',
    emoji: '☕',
    accent: 'amber',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject sits in a cozy boutique coffee shop. ' +
      'Warm overhead pendant lighting and afternoon window light from camera-left. ' +
      'A latte in a ceramic cup, an open laptop softly out of focus on the table in front of them. ' +
      'Background: blurred shelves of coffee bags, a small plant, soft warm bokeh. ' +
      'Subject leaning slightly forward, hands lightly resting near the cup, candid expression like mid-conversation with a friend. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'boardroom_exec',
    name: 'Boardroom Executive',
    subtitle: 'Glass conference room, skyline view, suit',
    bestFor: 'Finance, consulting, B2B sales, executive thought-leadership',
    emoji: '💼',
    accent: 'blue',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject stands in a modern corporate boardroom. ' +
      'Floor-to-ceiling glass behind them showing a softly blurred city skyline at golden hour. ' +
      'A long polished walnut conference table just visible in the foreground. ' +
      'Wearing a tailored dark suit jacket (no tie, top button open — modern executive, not stiff). ' +
      'Confident, calm posture. One hand resting on the table edge. ' +
      'Warm afternoon sidelight from the windows. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'gym_trainer',
    name: 'Gym / Trainer',
    subtitle: 'High-end gym floor, athletic wear',
    bestFor: 'Fitness, supplements, health, recovery products',
    emoji: '💪',
    accent: 'rose',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject stands on the floor of a premium modern gym. ' +
      'Behind them: blurred squat racks, dumbbells, and overhead industrial lighting. ' +
      'Wearing matte athletic top (charcoal or black), a towel slung over one shoulder. ' +
      'Slightly flushed from a workout, natural sweat sheen on the forehead (subtle, not exaggerated). ' +
      'Direct, focused expression. Mid-frame body language. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'retail_aisle_reviewer',
    name: 'Retail Aisle Reviewer',
    subtitle: 'Big-box store aisle, holding a product',
    bestFor: 'TikTok Shop product reviews, dropshipping, affiliate content',
    emoji: '🛒',
    accent: 'blue',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject is standing in a brightly lit big-box retail store aisle (think Target / Best Buy). ' +
      'Aisle shelves stretching back behind them in soft focus, full of consumer products in colorful packaging. ' +
      'Overhead fluorescent + LED retail lighting, slightly cool color temperature. ' +
      'Subject is holding a product box in one hand (generic blank-label box, ready for digital overlay later). ' +
      'Casual outfit (hoodie or denim jacket). Candid "look at this thing I just found" expression. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'outdoor_adventure',
    name: 'Outdoor Adventure',
    subtitle: 'Mountain trail or beach, golden hour',
    bestFor: 'Travel, outdoor brands, lifestyle, adventure dropshipping',
    emoji: '🏔️',
    accent: 'emerald',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject is outdoors on a scenic mountain trail at golden hour. ' +
      'Soft mountain ridges and pine trees in the distance, deeply out of focus. ' +
      'Warm low-angle sunlight from camera-right creating natural rim light on their hair. ' +
      'Wearing a quality outdoor jacket (Patagonia / Arc\'teryx style, muted earth tones). ' +
      'A small daypack strap visible on one shoulder. ' +
      'Standing relaxed, slight smile, like pausing mid-hike to talk to camera. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'home_office_creator',
    name: 'Home Office Creator',
    subtitle: 'Cozy home office, RGB lighting, ring light',
    bestFor: 'YouTube creators, tech reviews, gaming, online courses',
    emoji: '🎬',
    accent: 'purple',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject sits at a clean modern home office desk in front of a soft ring light. ' +
      'Behind them: tasteful shelving with books, a vinyl record or two, a single live plant, ' +
      'and warm-toned RGB ambient lighting (soft purple/teal wash, not gamer-loud). ' +
      'A mechanical keyboard and an ultrawide monitor softly visible. ' +
      'Wearing a comfortable but put-together top (henley or quality knit). ' +
      'Engaged, leaning slightly forward toward camera. ' +
      FACE_PRESERVATION,
  },
  {
    key: 'street_interview',
    name: 'Street Interview',
    subtitle: 'Urban sidewalk, daylight, handheld vibe',
    bestFor: 'Reaction content, man-on-the-street style, news commentary',
    emoji: '🏙️',
    accent: 'rose',
    geminiPrompt:
      QUALITY_PREFIX +
      'The subject stands on a busy urban sidewalk in mid-afternoon daylight. ' +
      'Behind them: blurred pedestrians, a softly out-of-focus storefront or street art, distant traffic. ' +
      'Natural overcast or shaded daylight (avoid harsh midday sun). ' +
      'Wearing casual everyday clothes (sweater or button-up). ' +
      'A handheld microphone with a small foam windscreen visible at the bottom of frame, suggesting an interview style. ' +
      'Candid mid-conversation expression, slight gesture mid-sentence. ' +
      FACE_PRESERVATION,
  },
];

/**
 * Lookup helper — returns null if the key is unknown so we never crash on
 * stale data after we rename or remove a preset.
 */
export function getSceneByKey(key: string | null | undefined): AvatarScene | null {
  if (!key) return null;
  return AVATAR_SCENES.find(s => s.key === key) ?? null;
}

/**
 * Build the full Gemini prompt for a given scene. Kept as a function so we
 * can later add per-avatar customization (e.g. "wearing a red shirt instead
 * of white") without changing the base library.
 */
export function buildScenePrompt(
  scene: AvatarScene,
  opts: { avatarDescription?: string } = {},
): string {
  const base = scene.geminiPrompt;
  if (opts.avatarDescription) {
    return `${base}\n\nAdditional context about the subject: ${opts.avatarDescription}`;
  }
  return base;
}
