/**
 * Hook category framework for diverse, high-quality hook generation.
 *
 * Each category represents a distinct psychological angle.
 * The generator must use a different category per hook in a batch
 * to guarantee diversity.
 */

export interface HookCategory {
  id: string;
  label: string;
  description: string;
  /** Example visual direction for this category */
  visualHint: string;
  /** Example verbal opener for this category */
  verbalHint: string;
}

export const HOOK_CATEGORIES: HookCategory[] = [
  {
    id: 'pattern_interrupt',
    label: 'Pattern Interrupt',
    description: 'Unexpected or visually jarring moment that breaks the scroll pattern. Something the viewer does NOT expect to see.',
    visualHint: 'Dropping product into toilet, smashing something, doing the opposite of what the product is for',
    verbalHint: '"I threw mine in the trash and here\'s why I bought it back"',
  },
  {
    id: 'pain_problem',
    label: 'Pain / Problem',
    description: 'Call out a specific, visceral pain the viewer relates to instantly. Make them feel seen in under 2 seconds.',
    visualHint: 'Close-up of the frustrating moment — tangled cords, product failing, sweat stain, empty shelf',
    verbalHint: '"If your mornings look like this, we need to talk"',
  },
  {
    id: 'curiosity_gap',
    label: 'Curiosity Gap',
    description: 'Withhold one key piece of information so the viewer MUST keep watching to find out.',
    visualHint: 'Object hidden behind hand or blurred out, reaction shot before reveal, unboxing paused mid-open',
    verbalHint: '"My dermatologist said to stop using this immediately"',
  },
  {
    id: 'contrarian',
    label: 'Contrarian / Myth-Busting',
    description: 'Challenge a widely held belief or call out popular advice as wrong. Creates instant tension.',
    visualHint: 'Crossing out popular product, side-eye at trending item, shaking head at screen',
    verbalHint: '"Everyone is wrong about this and I can prove it"',
  },
  {
    id: 'product_reveal',
    label: 'Product Reveal',
    description: 'Show the result, transformation, or effect FIRST — then reveal what caused it. Reverse the typical order.',
    visualHint: 'Glowing skin close-up, spotless counter, organized space — then pan to the product',
    verbalHint: '"People keep asking me what I changed so here it is"',
  },
  {
    id: 'relatable_story',
    label: 'Relatable Story',
    description: 'Start with a short, specific personal moment that feels like real life. Not polished — authentic.',
    visualHint: 'POV shot of real-life moment — kitchen mess, gym struggle, 2am phone screen, car dashboard',
    verbalHint: '"So I was at Target and this woman stopped me to ask about my skin"',
  },
  {
    id: 'demo_transformation',
    label: 'Demo / Transformation',
    description: 'Show the product doing its thing immediately — no setup, no explanation. The visual IS the hook.',
    visualHint: 'Split screen before/after, timelapse of product working, satisfying process shot',
    verbalHint: '"Watch this" or no verbal at all — let the visual speak',
  },
  {
    id: 'identity_status',
    label: 'Identity / Status',
    description: 'Speak directly to a specific type of person. Make them feel called out or aspirational.',
    visualHint: 'Aesthetic setup that signals the target identity — minimalist desk, stocked gym bag, curated shelf',
    verbalHint: '"If you\'re the kind of person who…" or "This is for my girls who…"',
  },
  {
    id: 'mistake_warning',
    label: 'Mistake / Warning',
    description: '"You\'re doing this wrong." Trigger the fear of missing out on information or making an error.',
    visualHint: 'Finger wagging at camera, crossing out the wrong way, showing common mistake in action',
    verbalHint: '"Stop doing this with your [product category] right now"',
  },
  {
    id: 'comparison',
    label: 'Comparison',
    description: 'Before vs after, cheap vs expensive, old way vs new way. Humans are wired to compare.',
    visualHint: 'Side-by-side layout, holding two products, dramatic before/after lighting change',
    verbalHint: '"The $8 version vs the $80 version and honestly…"',
  },
];

/** Select N categories from the pool, shuffled for variety */
export function selectCategories(count: number): HookCategory[] {
  const shuffled = [...HOOK_CATEGORIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, HOOK_CATEGORIES.length));
}
