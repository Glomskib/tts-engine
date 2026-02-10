/**
 * Seed Demo Data Script
 * Usage: npx tsx scripts/seed-demo-data.ts
 *
 * Idempotent — safe to re-run. Uses upsert/ON CONFLICT patterns.
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getAdminUserId(): Promise<string> {
  const { data } = await supabase.from('profiles').select('id').limit(1).single();
  if (!data?.id) {
    const { data: authData } = await supabase.auth.admin.listUsers();
    if (authData?.users?.[0]) return authData.users[0].id;
    throw new Error('No users found — create an account first');
  }
  return data.id;
}

async function seedProducts(userId: string) {
  console.log('  Seeding products...');
  const products = [
    { name: 'Ice Roller Face Massager', brand: 'GlowPro', category: 'Beauty', description: 'Stainless steel ice roller for puffiness and inflammation', price: 12.99 },
    { name: 'Magnetic Posture Corrector', brand: 'AlignFit', category: 'Health', description: 'Adjustable magnetic back brace for posture improvement', price: 24.99 },
    { name: 'LED Light Therapy Mask', brand: 'SkinRevive', category: 'Beauty', description: '7-color LED face mask for acne and anti-aging', price: 39.99 },
    { name: 'Portable Neck Massager', brand: 'RelaxPro', category: 'Wellness', description: 'EMS pulse neck massager with heat therapy', price: 29.99 },
    { name: 'Compression Knee Sleeve', brand: 'FlexGuard', category: 'Fitness', description: 'Copper-infused knee support for workouts', price: 15.99 },
    { name: 'Vitamin C Serum', brand: 'GlowPro', category: 'Beauty', description: '20% vitamin C with hyaluronic acid and vitamin E', price: 18.99 },
    { name: 'Smart Water Bottle', brand: 'HydroTrack', category: 'Wellness', description: 'LED reminder water bottle with temperature display', price: 22.99 },
    { name: 'Resistance Band Set', brand: 'FlexGuard', category: 'Fitness', description: '5-piece resistance band set with door anchor', price: 19.99 },
    { name: 'Aromatherapy Diffuser', brand: 'ZenHome', category: 'Home', description: 'Ultrasonic essential oil diffuser with LED lights', price: 27.99 },
    { name: 'Blue Light Blocking Glasses', brand: 'ClearView', category: 'Wellness', description: 'Anti-fatigue computer glasses with UV protection', price: 16.99 },
  ];

  for (const p of products) {
    const { error } = await supabase
      .from('products')
      .upsert({ ...p, user_id: userId }, { onConflict: 'name' })
      .select();

    if (error && !error.message.includes('duplicate')) {
      // Try insert without onConflict if upsert fails (name may not be unique constraint)
      const { error: insertErr } = await supabase.from('products').insert({ ...p, user_id: userId });
      if (insertErr && !insertErr.message.includes('duplicate')) {
        console.warn(`    Warning: ${p.name}: ${insertErr.message}`);
      }
    }
  }
  console.log(`    ${products.length} products seeded`);
}

async function seedScripts(userId: string) {
  console.log('  Seeding saved scripts...');

  // Check for existing scripts first
  const { count } = await supabase
    .from('saved_skits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count || 0) >= 5) {
    console.log('    Scripts already seeded (5+ exist), skipping');
    return;
  }

  const scripts = [
    {
      title: 'Ice Roller Morning Routine',
      skit_data: {
        hook: 'POV: Your morning skincare just got 10x better',
        body: 'Show ice roller in freezer. Pull out, demonstrate rolling on face. Show before/after puffiness comparison.',
        cta: 'Link in bio for 50% off today only',
        tone: 'energetic',
        duration: '30s',
      },
    },
    {
      title: 'Posture Corrector Office Worker',
      skit_data: {
        hook: 'My chiropractor said I need this or my back is done for',
        body: 'Show hunched posture at desk. Put on corrector. Dramatic transformation shot. Show end-of-day comparison.',
        cta: 'Save your spine — link below',
        tone: 'relatable',
        duration: '45s',
      },
    },
    {
      title: 'LED Mask Night Routine',
      skit_data: {
        hook: 'This is the $40 version of a $300 spa treatment',
        body: 'Dark room aesthetic. Put on LED mask. Show different color modes. Time-lapse of 15-minute session. Morning after skin results.',
        cta: 'Get yours before they sell out again',
        tone: 'aesthetic',
        duration: '60s',
      },
    },
    {
      title: 'Resistance Bands Home Workout',
      skit_data: {
        hook: 'Full gym workout. Zero gym membership. $20.',
        body: 'Quick montage of 5 exercises: squats, rows, chest press, shoulder raises, bicep curls. All with resistance bands.',
        cta: 'Comment GYM and I\'ll send you the full routine',
        tone: 'motivational',
        duration: '30s',
      },
    },
    {
      title: 'Smart Water Bottle Dehydration Test',
      skit_data: {
        hook: 'I was only drinking 2 cups of water a day and didn\'t even know',
        body: 'Show bottle glowing reminder. Track daily intake on bottle display. Show energy level difference after 1 week.',
        cta: 'Your body is begging you to hydrate — link in bio',
        tone: 'educational',
        duration: '45s',
      },
    },
  ];

  for (const s of scripts) {
    const { error } = await supabase.from('saved_skits').insert({
      ...s,
      user_id: userId,
    });
    if (error && !error.message.includes('duplicate')) {
      console.warn(`    Warning: ${s.title}: ${error.message}`);
    }
  }
  console.log(`    ${scripts.length} scripts seeded`);
}

async function seedWinners(userId: string) {
  console.log('  Seeding winners bank...');

  const { count } = await supabase
    .from('winners_bank')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count || 0) >= 3) {
    console.log('    Winners already seeded (3+ exist), skipping');
    return;
  }

  const winners = [
    {
      hook: 'I\'ve been using this wrong my entire life',
      video_url: 'https://tiktok.com/@example/video/demo1',
      view_count: 2500000,
      source_type: 'external',
      notes: 'Universal hook — works for any product with a non-obvious use case. 2.5M views on original.',
      patterns: ['curiosity gap', 'self-deprecating', 'tutorial reveal'],
      category: 'Beauty',
    },
    {
      hook: 'POV: Your doctor finally tells you the real reason you\'re tired',
      video_url: 'https://tiktok.com/@example/video/demo2',
      view_count: 1800000,
      source_type: 'external',
      notes: 'Authority + pain point hook. Works great for wellness/supplement products.',
      patterns: ['authority figure', 'pain point', 'revelation'],
      category: 'Health',
    },
    {
      hook: 'Things TikTok made me buy that were actually worth it',
      video_url: 'https://tiktok.com/@example/video/demo3',
      view_count: 3200000,
      source_type: 'external',
      notes: 'Social proof compilation format. Great for multi-product showcases.',
      patterns: ['social proof', 'listicle', 'honest review'],
      category: 'General',
    },
  ];

  for (const w of winners) {
    const { error } = await supabase.from('winners_bank').insert({
      ...w,
      user_id: userId,
    });
    if (error && !error.message.includes('duplicate')) {
      console.warn(`    Warning: ${w.hook.slice(0, 40)}: ${error.message}`);
    }
  }
  console.log(`    ${winners.length} winners seeded`);
}

async function seedTrendingHashtags(userId: string) {
  console.log('  Seeding trending hashtags...');

  const { count } = await supabase
    .from('trending_hashtags')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count || 0) >= 5) {
    console.log('    Hashtags already seeded (5+ exist), skipping');
    return;
  }

  const hashtags = [
    { hashtag: '#TikTokMadeMeBuyIt', category: 'Shopping', view_count: 58000000000, video_count: 12000000, growth_rate: 8.5 },
    { hashtag: '#MorningRoutine', category: 'Lifestyle', view_count: 22000000000, video_count: 5400000, growth_rate: 12.3 },
    { hashtag: '#SkincareRoutine', category: 'Beauty', view_count: 31000000000, video_count: 7200000, growth_rate: 6.8 },
    { hashtag: '#GymTok', category: 'Fitness', view_count: 15000000000, video_count: 3800000, growth_rate: 15.1 },
    { hashtag: '#ChronicIllness', category: 'Health', view_count: 4200000000, video_count: 980000, growth_rate: 22.4 },
  ];

  for (const h of hashtags) {
    const { error } = await supabase.from('trending_hashtags').insert({
      ...h,
      user_id: userId,
    });
    if (error && !error.message.includes('duplicate')) {
      console.warn(`    Warning: ${h.hashtag}: ${error.message}`);
    }
  }
  console.log(`    ${hashtags.length} hashtags seeded`);
}

async function main() {
  console.log('FlashFlow Demo Data Seeder');
  console.log('=========================\n');

  try {
    const userId = await getAdminUserId();
    console.log(`Using user: ${userId}\n`);

    await seedProducts(userId);
    await seedScripts(userId);
    await seedWinners(userId);
    await seedTrendingHashtags(userId);

    console.log('\nDone! All demo data seeded successfully.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
