/**
 * Onboarding Data Seed API
 *
 * GET  — Audit: row counts for every table
 * POST — Auto-seed missing data: products, personas, sample scripts
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateCorrelationId,
  createApiErrorResponse,
} from "@/lib/api-errors";

export const runtime = "nodejs";

// Tables to count
const TABLES = [
  "products",
  "audience_personas",
  "saved_skits",
  "videos",
  "winners_bank",
  "tiktok_accounts",
  "content_packages",
  "script_of_the_day",
  "daily_summaries",
  "va_briefs",
  "winner_pattern_analyses",
  "script_presets",
  "trending_hashtags",
  "brands",
  "user_subscriptions",
];

// ---------------------------------------------------------------------------
// GET — Database audit: row counts for every table
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;
  const counts: Record<string, number> = {};
  const errors: string[] = [];

  for (const table of TABLES) {
    try {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (error) {
        // Some tables don't have user_id — try without
        const { count: globalCount, error: err2 } = await supabaseAdmin
          .from(table)
          .select("id", { count: "exact", head: true });

        if (err2) {
          errors.push(`${table}: ${err2.message}`);
          counts[table] = -1;
        } else {
          counts[table] = globalCount || 0;
        }
      } else {
        counts[table] = count || 0;
      }
    } catch {
      counts[table] = -1;
      errors.push(`${table}: table may not exist`);
    }
  }

  // Determine what needs seeding
  const needs = {
    products: (counts.products || 0) < 5,
    personas: (counts.audience_personas || 0) < 3,
    scripts: (counts.saved_skits || 0) === 0,
  };

  const res = NextResponse.json({
    ok: true,
    data: { counts, needs, errors },
    correlation_id: correlationId,
  });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

// ---------------------------------------------------------------------------
// POST — Seed missing data
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;
  const seeded: Record<string, number> = {};

  // 1. Count existing products
  const { count: productCount } = await supabaseAdmin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((productCount || 0) < 5) {
    const products = getWellnessProducts();
    let added = 0;
    for (const p of products) {
      const { error } = await supabaseAdmin
        .from("products")
        .upsert({ ...p, user_id: userId }, { onConflict: "id" })
        .select();
      if (!error) added++;
    }
    seeded.products = added;
  }

  // 2. Count existing personas
  const { count: personaCount } = await supabaseAdmin
    .from("audience_personas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((personaCount || 0) < 3) {
    const personas = getAudiencePersonas();
    let added = 0;
    for (const p of personas) {
      const { error } = await supabaseAdmin
        .from("audience_personas")
        .insert({ ...p, user_id: userId })
        .select();
      if (!error) added++;
    }
    seeded.personas = added;
  }

  // 3. Count existing scripts
  const { count: scriptCount } = await supabaseAdmin
    .from("saved_skits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((scriptCount || 0) === 0) {
    // Get first few products for scripts
    const { data: userProducts } = await supabaseAdmin
      .from("products")
      .select("id, name, brand")
      .eq("user_id", userId)
      .limit(5);

    const scripts = getSampleScripts(userProducts || []);
    let added = 0;
    for (const s of scripts) {
      const { error } = await supabaseAdmin
        .from("saved_skits")
        .insert({ ...s, user_id: userId })
        .select();
      if (!error) added++;
    }
    seeded.scripts = added;
  }

  // Re-count everything
  const finalCounts: Record<string, number> = {};
  for (const table of TABLES) {
    try {
      const { count } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      finalCounts[table] = count || 0;
    } catch {
      try {
        const { count } = await supabaseAdmin
          .from(table)
          .select("id", { count: "exact", head: true });
        finalCounts[table] = count || 0;
      } catch {
        finalCounts[table] = -1;
      }
    }
  }

  const res = NextResponse.json({
    ok: true,
    data: { seeded, counts: finalCounts },
    correlation_id: correlationId,
  });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

// ---------------------------------------------------------------------------
// Seed data: 10 real TikTok Shop wellness/health products
// ---------------------------------------------------------------------------
function getWellnessProducts() {
  return [
    {
      name: "Ice Roller for Face & Eyes",
      brand: "Latme",
      category: "Beauty",
      description: "Stainless steel ice roller for reducing puffiness, migraines, and pain relief. Keep in freezer for instant de-puffing morning routine.",
      price: 9.99,
    },
    {
      name: "Gua Sha Rose Quartz Set",
      brand: "BAIMEI",
      category: "Beauty",
      description: "Natural rose quartz gua sha and jade roller set for facial sculpting, lymphatic drainage, and reducing fine lines.",
      price: 8.99,
    },
    {
      name: "Magnetic Posture Corrector",
      brand: "Mercase",
      category: "Health",
      description: "Adjustable back posture corrector brace with 12 magnets. Relieves back, shoulder, and neck pain from desk work.",
      price: 21.99,
    },
    {
      name: "Collagen Peptides Powder",
      brand: "Vital Proteins",
      category: "Supplements",
      description: "Unflavored collagen powder for skin, hair, nails, and joint support. 20g protein per serving. Dissolves in hot or cold liquids.",
      price: 27.00,
    },
    {
      name: "Blue Light Blocking Glasses",
      brand: "FEIYOLD",
      category: "Health",
      description: "Stylish blue light glasses for computer use. Reduces eye strain, headaches, and improves sleep quality. Unisex design.",
      price: 15.98,
    },
    {
      name: "Acupressure Mat and Pillow Set",
      brand: "ProsourceFit",
      category: "Wellness",
      description: "Spike mat for back pain relief, muscle relaxation, and stress reduction. 6,210 acupressure points. Includes carry bag.",
      price: 25.99,
    },
    {
      name: "Turmeric Gummies with Black Pepper",
      brand: "Nature's Craft",
      category: "Supplements",
      description: "Anti-inflammatory turmeric curcumin gummies with BioPerine for absorption. Joint support, immune boost, and brain health.",
      price: 14.99,
    },
    {
      name: "Scalp Massager Shampoo Brush",
      brand: "HEETA",
      category: "Beauty",
      description: "Silicone scalp scrubber for hair growth stimulation, dandruff removal, and stress relief. Wet and dry use.",
      price: 7.99,
    },
    {
      name: "Portable Neck and Back Massager",
      brand: "InvoSpa",
      category: "Wellness",
      description: "Shiatsu neck massager with heat. Deep tissue kneading for neck, back, shoulders, and legs. Rechargeable.",
      price: 39.99,
    },
    {
      name: "Vitamin C Brightening Serum",
      brand: "TruSkin",
      category: "Beauty",
      description: "20% Vitamin C serum with hyaluronic acid and vitamin E. Brightens dark spots, reduces wrinkles, and boosts collagen.",
      price: 19.99,
    },
  ];
}

// ---------------------------------------------------------------------------
// Seed data: 5 audience personas
// ---------------------------------------------------------------------------
function getAudiencePersonas() {
  return [
    {
      name: "Chronic Illness Warrior",
      description: "Lives with a chronic condition and constantly seeking products that provide genuine relief. Skeptical of miracle cures but hopeful.",
      age_range: "28-45",
      gender: "any",
      lifestyle: "Limited energy, prioritizes self-care, active in support communities",
      pain_points: JSON.stringify([
        { point: "Constant pain or fatigue affects daily life", intensity: 9, triggers: ["flare-ups", "weather changes", "stress"] },
        { point: "Wasted money on products that don't work", intensity: 8, triggers: ["fake reviews", "influencer shills"] },
        { point: "Feeling dismissed by doctors", intensity: 7, triggers: ["medical appointments", "new symptoms"] },
      ]),
      tone: "empathetic",
      humor_style: "dark humor / self-deprecating",
      phrases_they_use: ["spoon theory", "flare day", "brain fog", "good pain day", "actually works"],
      phrases_to_avoid: ["just try harder", "have you tried yoga", "it's all in your head"],
      content_they_engage_with: ["honest reviews", "day-in-my-life", "what I actually use", "spoonie hacks"],
      product_categories: ["Health", "Wellness", "Supplements"],
    },
    {
      name: "Fitness Enthusiast",
      description: "Dedicated to their fitness journey. Always looking for supplements, recovery tools, and performance enhancers with evidence.",
      age_range: "22-35",
      gender: "any",
      lifestyle: "Gym 5x/week, tracks macros, follows fitness influencers, competitive",
      pain_points: JSON.stringify([
        { point: "Recovery time cuts into training", intensity: 7, triggers: ["leg day", "competitions", "plateaus"] },
        { point: "Supplement market is full of BS", intensity: 8, triggers: ["proprietary blends", "no third-party testing"] },
        { point: "Injuries from overtraining", intensity: 6, triggers: ["pushing too hard", "bad form"] },
      ]),
      tone: "motivational",
      humor_style: "gym bro humor",
      phrases_they_use: ["gains", "PR", "macro friendly", "recovery", "clean ingredients", "third-party tested"],
      phrases_to_avoid: ["get fit quick", "no effort needed", "skip the gym"],
      content_they_engage_with: ["transformation content", "what I eat in a day", "supplement reviews", "form checks"],
      product_categories: ["Health", "Supplements", "Wellness"],
    },
    {
      name: "Busy Mom",
      description: "Juggling kids, work, and self-care. Needs products that are quick, effective, and don't require a 10-step routine.",
      age_range: "30-42",
      gender: "female",
      lifestyle: "Time-poor, multitasker, shops during nap time, values convenience",
      pain_points: JSON.stringify([
        { point: "Zero time for self-care routines", intensity: 9, triggers: ["morning rush", "bedtime chaos"] },
        { point: "Mom guilt about spending on herself", intensity: 7, triggers: ["cart abandonment", "price comparison"] },
        { point: "Exhaustion and touch-out from kids", intensity: 8, triggers: ["end of day", "solo parenting"] },
      ]),
      tone: "relatable",
      humor_style: "mom humor / sarcastic",
      phrases_they_use: ["game changer", "nap time haul", "mom hack", "worth every penny", "2-minute routine"],
      phrases_to_avoid: ["you should make time", "when I was your age", "it's easy"],
      content_they_engage_with: ["quick routines", "get ready with me", "mom hacks", "honest reviews"],
      product_categories: ["Beauty", "Health", "Wellness"],
    },
    {
      name: "Skincare Obsessed",
      description: "Deep into skincare science. Knows their ingredients, follows dermatologists on social media, and curates a careful routine.",
      age_range: "20-35",
      gender: "any",
      lifestyle: "Researches ingredients, watches SkincareByHyram, has a 7+ step routine, shade-matches everything",
      pain_points: JSON.stringify([
        { point: "Products that break them out", intensity: 9, triggers: ["new product", "fragrance", "bad formulation"] },
        { point: "Misleading marketing claims", intensity: 8, triggers: ["greenwashing", "no clinical data"] },
        { point: "Finding products for their specific concerns", intensity: 7, triggers: ["hyperpigmentation", "texture", "redness"] },
      ]),
      tone: "informative",
      humor_style: "ingredient snob humor",
      phrases_they_use: ["ingredients list", "barrier repair", "niacinamide", "non-comedogenic", "patch test", "holy grail"],
      phrases_to_avoid: ["chemicals are bad", "all natural", "miracle cream"],
      content_they_engage_with: ["ingredient breakdowns", "before/after", "derm reactions", "texture shots"],
      product_categories: ["Beauty"],
    },
    {
      name: "Home Organizer",
      description: "Finds joy in decluttering and organizing. Always looking for products that make spaces cleaner, tidier, and more aesthetic.",
      age_range: "25-45",
      gender: "any",
      lifestyle: "Watches organizing TikTok, Marie Kondo fan, Amazon haul regular, aesthetic-driven",
      pain_points: JSON.stringify([
        { point: "Small spaces that feel cluttered", intensity: 7, triggers: ["apartment living", "moving", "holidays"] },
        { point: "Products that don't fit standard sizes", intensity: 6, triggers: ["wrong measurements", "returns"] },
        { point: "Family members not maintaining organization", intensity: 8, triggers: ["kids", "partner", "guests"] },
      ]),
      tone: "satisfying",
      humor_style: "before/after drama",
      phrases_they_use: ["restock", "satisfying", "aesthetic", "everything has a place", "TikTok made me buy it"],
      phrases_to_avoid: ["just throw it away", "who cares about organization"],
      content_they_engage_with: ["restock videos", "before/after", "hauls", "fridge organization", "pantry goals"],
      product_categories: ["Wellness"],
    },
  ];
}

// ---------------------------------------------------------------------------
// Seed data: 5 sample scripts using product data
// ---------------------------------------------------------------------------
function getSampleScripts(
  products: Array<{ id: string; name: string; brand: string | null }>,
) {
  const templates = [
    {
      titleTemplate: "POV: You just discovered {product}",
      skit_data: {
        hook_line: "Wait... this actually works?",
        beats: [
          { t: "0-3s", action: "Shocked face looking at product", dialogue: "Okay I was NOT expecting this" },
          { t: "3-8s", action: "Show product close up", dialogue: "So I've been using {product} for a week now..." },
          { t: "8-15s", action: "Demonstrate use", dialogue: "And look at the difference. LOOK." },
          { t: "15-20s", action: "Show result/reaction", dialogue: "I literally ordered 3 more. Link in bio." },
        ],
        cta_line: "Link in bio — trust me on this one",
        cta_overlay: "Link in bio | 50% off today",
      },
    },
    {
      titleTemplate: "Things I wish I knew before buying {product}",
      skit_data: {
        hook_line: "3 things nobody tells you about {product}",
        beats: [
          { t: "0-2s", action: "Hold up 3 fingers", dialogue: "Three things I wish I knew before buying this" },
          { t: "2-7s", action: "Show product", dialogue: "Number one — it takes about 3 days to see results, not instantly" },
          { t: "7-12s", action: "Demonstrate proper use", dialogue: "Two — you HAVE to use it like this, not like everyone shows" },
          { t: "12-18s", action: "Show results", dialogue: "Three — once it works, you'll wonder how you lived without it" },
        ],
        cta_line: "Get yours — link in bio",
        cta_overlay: "Shop Now | TikTok Shop",
      },
    },
    {
      titleTemplate: "My honest review of {product}",
      skit_data: {
        hook_line: "I'm gonna be brutally honest about this",
        beats: [
          { t: "0-3s", action: "Serious face to camera", dialogue: "Okay I need to talk about this product" },
          { t: "3-10s", action: "Show unboxing or product", dialogue: "Everyone's been hyping up {product} and I finally tried it" },
          { t: "10-18s", action: "Show daily use montage", dialogue: "After two weeks... I get it. I actually get the hype." },
          { t: "18-22s", action: "Show close-up results", dialogue: "The results speak for themselves" },
        ],
        cta_line: "Try it yourself — link below",
        cta_overlay: "Honest Review | Link in Bio",
      },
    },
    {
      titleTemplate: "Morning routine with {product}",
      skit_data: {
        hook_line: "My morning routine just changed forever",
        beats: [
          { t: "0-2s", action: "Wake up shot, cozy bed", dialogue: "Alright let me show you my new morning game changer" },
          { t: "2-8s", action: "Get out of bed, go to product", dialogue: "Every morning now I start with {product}" },
          { t: "8-15s", action: "Use product step by step", dialogue: "It takes literally 2 minutes and the difference is insane" },
          { t: "15-20s", action: "Show glowing/energized result", dialogue: "Mom life hack right here. You need this." },
        ],
        cta_line: "Link in bio — you'll thank me later",
        cta_overlay: "Morning Routine | Shop Now",
      },
    },
    {
      titleTemplate: "{product} vs the expensive version",
      skit_data: {
        hook_line: "Save your money — this $12 product works better than the $80 one",
        beats: [
          { t: "0-3s", action: "Hold up both products", dialogue: "I tested the TikTok version against the expensive one" },
          { t: "3-10s", action: "Side by side comparison", dialogue: "This is {product} at a fraction of the cost" },
          { t: "10-17s", action: "Show results comparison", dialogue: "And honestly? The cheap one won. Not even close." },
          { t: "17-22s", action: "Throw expensive one aside dramatically", dialogue: "Save your money. Link below." },
        ],
        cta_line: "Budget win — link in bio",
        cta_overlay: "Budget vs Luxury | TikTok Shop",
      },
    },
  ];

  return templates.slice(0, Math.min(5, products.length || 5)).map((t, i) => {
    const product = products[i] || { id: null, name: "Sample Product", brand: "Brand" };
    const title = t.titleTemplate.replace("{product}", product.name);
    const skitData = JSON.parse(
      JSON.stringify(t.skit_data).replace(/\{product\}/g, product.name),
    );

    return {
      title,
      skit_data: skitData,
      product_id: product.id || null,
      product_name: product.name,
      product_brand: product.brand || null,
      status: "draft",
    };
  });
}
