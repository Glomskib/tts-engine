/**
 * Avatar Engine — Niche Starter Scripts + Affiliate Networks (2026-06-01)
 *
 * Keyed by the same archetype `key` defined in
 *   web/app/avatars/new/page.tsx → ARCHETYPES
 *
 * STARTER_SCRIPTS_BY_NICHE: 5 hook openings per niche. Each hook is a
 *   7-second cold-open (~25 words max) tuned to that niche's typical
 *   pattern-interrupt style. `[PRODUCT]` is the slot for the affiliate /
 *   featured product — render time we string-replace it.
 *
 * RECOMMENDED_AFFILIATE_NETWORKS: 2-3 networks per niche that affiliate
 *   marketers actually use for that vertical (Amazon Associates,
 *   ShareASale, Impact, ClickBank, TikTok Shop, Rakuten, CJ, etc.).
 *
 * Both maps are intentionally split from the ARCHETYPES array so the
 * /avatars/new client bundle stays light and only loads scripts when
 * the user opens the "Generate scripts" workflow.
 */

export interface StarterScript {
  /** ~25-word, 7-second cold-open hook. */
  hook: string;
  /** Optional one-line description of the pattern interrupt this hook uses. */
  pattern?: string;
}

export const STARTER_SCRIPTS_BY_NICHE: Record<string, StarterScript[]> = {
  // ── Joint pain ─────────────────────────────────────────────────────────────
  'joint-pain-expert': [
    { hook: "If your knees crack when you stand up, stop ignoring it. Here's what 30 years of joint research says about [PRODUCT].", pattern: 'credentialed warning' },
    { hook: "Most people over 50 do this one thing every morning that wrecks their joints. [PRODUCT] is the 60-second fix I tell my patients about.", pattern: 'common mistake' },
    { hook: "Your joints aren't 'just getting old.' They're inflamed. Here's the cheapest way I've seen to calm them down using [PRODUCT].", pattern: 'reframe' },
    { hook: "Three signs your cartilage is breaking down faster than it should. Number two is why I started recommending [PRODUCT] to everyone.", pattern: 'numbered list tease' },
    { hook: "The stiffness when you get out of a car isn't normal — it's a warning. This is the routine with [PRODUCT] I give patients first.", pattern: 'symptom callout' },
  ],

  // ── Weight loss / GLP-1 ────────────────────────────────────────────────────
  'glp1-weight-coach': [
    { hook: "If you're on a GLP-1 and losing muscle, this is what nobody told you. [PRODUCT] is what I take alongside it now.", pattern: 'insider info' },
    { hook: "I lost 40 pounds without giving up carbs. The thing that actually moved the needle? [PRODUCT] — and one habit I'll show you.", pattern: 'personal results' },
    { hook: "Stop counting calories. Start counting protein. Here's exactly how I hit 130g a day using [PRODUCT].", pattern: 'reframe' },
    { hook: "If the scale won't budge, it's not your willpower — it's your fiber. [PRODUCT] is the easiest fix I've found.", pattern: 'absolve viewer' },
    { hook: "Three non-scale wins that mean it's working, even when the number isn't moving. [PRODUCT] helped me notice all three.", pattern: 'numbered list tease' },
  ],

  // ── Skincare / derm ────────────────────────────────────────────────────────
  'skincare-derm': [
    { hook: "If your skincare burns when you put it on, you're using it wrong. Here's how I layer [PRODUCT] without wrecking your barrier.", pattern: 'fix a mistake' },
    { hook: "Retinol vs retinal vs retinoid — most people are using the wrong one. [PRODUCT] is the one I tell patients to start with.", pattern: 'demystify' },
    { hook: "The reason your serum isn't working has nothing to do with the brand. It's the order. Here's where [PRODUCT] fits in.", pattern: 'reframe' },
    { hook: "Three signs your skin barrier is broken — not dry. [PRODUCT] is the simplest thing I've found to repair it in a week.", pattern: 'symptom callout' },
    { hook: "Stop buying $100 moisturizers. The active that actually does the work is in [PRODUCT] for a fraction of the price.", pattern: 'price reframe' },
  ],

  // ── Supplement educator ────────────────────────────────────────────────────
  'supplement-educator': [
    { hook: "Magnesium glycinate vs citrate vs threonate — they do completely different things. Here's what the research says about [PRODUCT].", pattern: 'demystify' },
    { hook: "Most multivitamins are missing the one thing your body actually needs. [PRODUCT] is the one I keep coming back to.", pattern: 'gap callout' },
    { hook: "If you're tired all the time and your iron is 'normal,' it's probably this. The research on [PRODUCT] is wild.", pattern: 'hidden cause' },
    { hook: "Here's how to tell if a supplement is actually doing anything in your body — and how I tested [PRODUCT] on myself.", pattern: 'self-experiment' },
    { hook: "Three supplements that show up in almost every study on energy. [PRODUCT] stacks all three in one capsule.", pattern: 'numbered list tease' },
  ],

  // ── Pet wellness ───────────────────────────────────────────────────────────
  'pet-wellness': [
    { hook: "If your dog's coat looks dull, it's not the shampoo — it's their gut. [PRODUCT] turned my golden's coat around in 3 weeks.", pattern: 'hidden cause' },
    { hook: "Stop spending $80 on premium kibble. The thing that actually changes your dog's energy is [PRODUCT], and it's $20.", pattern: 'price reframe' },
    { hook: "Three signs your senior dog is in pain that owners always miss. [PRODUCT] is what my vet finally recommended for mine.", pattern: 'numbered list tease' },
    { hook: "Cats hide pain. By the time you see it, it's bad. Here's the daily routine with [PRODUCT] that's kept my 14-year-old going.", pattern: 'urgency reframe' },
    { hook: "If your dog scratches constantly and the food switch didn't help, it's probably this. [PRODUCT] is the cheapest first thing to try.", pattern: 'symptom callout' },
  ],

  // ── Financial coach ────────────────────────────────────────────────────────
  'financial-coach': [
    { hook: "If your credit score is under 650, stop paying for credit repair. [PRODUCT] does the same thing for free in 60 days.", pattern: 'cost reframe' },
    { hook: "Here's the math nobody shows you on minimum credit card payments. [PRODUCT] cut my payoff time in half — here's how.", pattern: 'hidden math' },
    { hook: "Three things on your credit report that are silently dropping your score. [PRODUCT] flags them automatically.", pattern: 'numbered list tease' },
    { hook: "If you're carrying $5K+ in credit card debt, don't transfer it — consolidate it. [PRODUCT] is the option most people don't know about.", pattern: 'contrarian advice' },
    { hook: "Stop checking your credit score on the bank app. It's the wrong number. [PRODUCT] shows you the one lenders actually pull.", pattern: 'reframe' },
  ],

  // ── Sleep expert ───────────────────────────────────────────────────────────
  'sleep-expert': [
    { hook: "If you wake up at 3am every night, it's not stress. It's your blood sugar. [PRODUCT] is the simplest thing to fix it.", pattern: 'reframe' },
    { hook: "Your mattress isn't the problem. Your bedroom temperature is. Here's the 4-degree change and [PRODUCT] I tell my patients about.", pattern: 'unexpected cause' },
    { hook: "Magnesium for sleep is half the story. The other half is [PRODUCT] — and the timing matters more than the dose.", pattern: 'demystify' },
    { hook: "If you fall asleep but wake up exhausted, you're missing deep sleep, not total sleep. [PRODUCT] is what fixed it for me.", pattern: 'symptom callout' },
    { hook: "Three things your phone does after 9pm that ruin tomorrow's energy. [PRODUCT] solves the worst one in 30 seconds.", pattern: 'numbered list tease' },
  ],

  // ── Energy + focus ─────────────────────────────────────────────────────────
  'energy-focus-coach': [
    { hook: "If coffee makes you crash by 2pm, you're missing the other half of the stack. [PRODUCT] is the L-theanine fix in one pill.", pattern: 'completion fix' },
    { hook: "Brain fog isn't fatigue. It's inflammation in your prefrontal cortex. [PRODUCT] is the one nootropic with actual study data.", pattern: 'hidden cause' },
    { hook: "I tracked my focus for 30 days on [PRODUCT]. The results were way better than caffeine — here's the dosing protocol.", pattern: 'self-experiment' },
    { hook: "Three signs you're under-dosed on B12 and don't know it. [PRODUCT] is the methylated form your body actually uses.", pattern: 'numbered list tease' },
    { hook: "Stop chasing dopamine on TikTok. Build it instead — here's the 5-minute morning stack with [PRODUCT] that resets your baseline.", pattern: 'reframe' },
  ],

  // ── Hair regrowth ──────────────────────────────────────────────────────────
  'hair-regrowth': [
    { hook: "If your part is getting wider, you have 90 days to stop it. [PRODUCT] is the daily 30-second thing I wish I'd started sooner.", pattern: 'urgency window' },
    { hook: "Postpartum shedding isn't 'normal' for 12 months. It's a signal. [PRODUCT] is what turned mine around in 60 days.", pattern: 'reframe' },
    { hook: "Three myths about hair growth that are costing you. Number three is why I switched to [PRODUCT] last year.", pattern: 'numbered list tease' },
    { hook: "Your scalp is skin. Treat it like skin. [PRODUCT] is the scalp serum that finally made my hair feel thicker at the root.", pattern: 'mindset shift' },
    { hook: "Before-and-after photos lie. Here's the actual measurement I track every month — and how [PRODUCT] moved it.", pattern: 'credibility flip' },
  ],

  // ── Tech reviewer ──────────────────────────────────────────────────────────
  'tech-reviewer': [
    { hook: "I've tested 14 of these this year. Only one is worth your money. [PRODUCT] is the surprise winner — here's why.", pattern: 'tested comparison' },
    { hook: "Stop buying the flagship. The mid-tier from this brand is 90% of the experience. [PRODUCT] is the move.", pattern: 'value reframe' },
    { hook: "Three things every reviewer skips on this category. Number two is the reason I'm recommending [PRODUCT] over the obvious pick.", pattern: 'numbered list tease' },
    { hook: "If you already own [other gadget], you don't need this — except for one thing. [PRODUCT] is worth it for that alone.", pattern: 'upgrade carve-out' },
    { hook: "The spec everyone is comparing on doesn't matter. This one does. Here's how [PRODUCT] wins where it actually counts.", pattern: 'reframe' },
  ],
};

/**
 * Affiliate networks each niche actually uses. Mix of:
 *  - Amazon Associates: broad, low-payout, easy approval
 *  - ShareASale: skincare, supplements, pet
 *  - Impact: large brand partnerships across most verticals
 *  - ClickBank: high-payout health / weight-loss / digital
 *  - CJ Affiliate (Commission Junction): finance, big retail
 *  - TikTok Shop: viral consumer products, supplements, beauty, gadgets
 *  - Rakuten: department stores, beauty
 *  - FlexOffers: aggregator, finance + insurance
 */
export interface AffiliateNetwork {
  key: string;
  display_name: string;
  /** Short note on why it fits this niche. */
  note?: string;
}

export const RECOMMENDED_AFFILIATE_NETWORKS: Record<string, AffiliateNetwork[]> = {
  'joint-pain-expert': [
    { key: 'clickbank', display_name: 'ClickBank', note: 'High-payout joint/mobility supplements' },
    { key: 'amazon', display_name: 'Amazon Associates', note: 'Braces, topicals, mobility tools' },
    { key: 'shareasale', display_name: 'ShareASale', note: 'Direct-to-consumer supplement brands' },
  ],

  'glp1-weight-coach': [
    { key: 'clickbank', display_name: 'ClickBank', note: 'Weight-loss + protein product payouts' },
    { key: 'impact', display_name: 'Impact', note: 'Telehealth + GLP-1-adjacent brands' },
    { key: 'amazon', display_name: 'Amazon Associates', note: 'Protein, fiber, kitchen scales' },
  ],

  'skincare-derm': [
    { key: 'shareasale', display_name: 'ShareASale', note: 'Indie + clinical skincare brands' },
    { key: 'impact', display_name: 'Impact', note: 'Sephora, Dermstore, big retail derms' },
    { key: 'tiktok_shop', display_name: 'TikTok Shop', note: 'Viral SKUs convert in-platform' },
  ],

  'supplement-educator': [
    { key: 'amazon', display_name: 'Amazon Associates', note: 'Best for neutral, brand-agnostic reviews' },
    { key: 'tiktok_shop', display_name: 'TikTok Shop', note: 'In-feed supplement conversions' },
    { key: 'shareasale', display_name: 'ShareASale', note: 'Premium DTC supplement brands' },
  ],

  'pet-wellness': [
    { key: 'amazon', display_name: 'Amazon Associates', note: 'Pet food, supplements, gear' },
    { key: 'impact', display_name: 'Impact', note: 'Chewy, Petco, premium DTC pet brands' },
    { key: 'shareasale', display_name: 'ShareASale', note: 'Boutique pet supplement brands' },
  ],

  'financial-coach': [
    { key: 'flexoffers', display_name: 'FlexOffers', note: 'Strong finance + credit-repair inventory' },
    { key: 'cj', display_name: 'CJ Affiliate', note: 'Credit card + debt consolidation programs' },
    { key: 'impact', display_name: 'Impact', note: 'Fintech (Credit Karma, Self, etc.)' },
  ],

  'sleep-expert': [
    { key: 'impact', display_name: 'Impact', note: 'Mattress + sleep brands (Helix, Saatva, etc.)' },
    { key: 'amazon', display_name: 'Amazon Associates', note: 'Sleep aids, blackout, white noise' },
    { key: 'shareasale', display_name: 'ShareASale', note: 'Premium sleep supplements' },
  ],

  'energy-focus-coach': [
    { key: 'clickbank', display_name: 'ClickBank', note: 'High-payout nootropic stacks' },
    { key: 'amazon', display_name: 'Amazon Associates', note: 'Standard caffeine/L-theanine/B12 SKUs' },
    { key: 'impact', display_name: 'Impact', note: 'Productivity apps + nootropic DTC brands' },
  ],

  'hair-regrowth': [
    { key: 'clickbank', display_name: 'ClickBank', note: 'Top vertical for hair-regrowth offers' },
    { key: 'impact', display_name: 'Impact', note: 'Hims/Hers, Nutrafol, Vegamour' },
    { key: 'tiktok_shop', display_name: 'TikTok Shop', note: 'Viral scalp serums + tools' },
  ],

  'tech-reviewer': [
    { key: 'amazon', display_name: 'Amazon Associates', note: 'Standard gadget review affiliate' },
    { key: 'impact', display_name: 'Impact', note: 'Direct brand partnerships (Anker, Razer, etc.)' },
    { key: 'rakuten', display_name: 'Rakuten', note: 'Best Buy + big-box electronics' },
  ],
};

/** Convenience: get scripts + networks for a given archetype key. */
export function getNicheStarterPack(archetypeKey: string): {
  scripts: StarterScript[];
  networks: AffiliateNetwork[];
} {
  return {
    scripts: STARTER_SCRIPTS_BY_NICHE[archetypeKey] ?? [],
    networks: RECOMMENDED_AFFILIATE_NETWORKS[archetypeKey] ?? [],
  };
}
