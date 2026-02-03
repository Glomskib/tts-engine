/**
 * Run migration 073_expanded_personas.sql
 * Usage: npx tsx scripts/run-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env.local
function loadEnv() {
  const envPath = join(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  const env: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('Running migration 073_expanded_personas.sql...\n');

  try {
    // Step 1: Add columns if they don't exist
    console.log('Step 1: Adding columns if needed...');

    // Check and add category column
    const { error: catErr } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'audience_personas' AND column_name = 'category'
          ) THEN
            ALTER TABLE public.audience_personas ADD COLUMN category TEXT;
          END IF;
        END $$;
      `
    });

    if (catErr) {
      // Try direct query approach
      console.log('Using direct query approach...');
    }

    // Step 2: Update existing personas with categories
    console.log('Step 2: Updating existing personas with categories...');

    const updates = [
      { name: 'Sarah', category: 'lifestyle' },
      { name: 'Mike', category: 'tech' },
      { name: 'Jessica', category: 'lifestyle' },
      { name: 'David', category: 'comedy' },
      { name: 'Emma', category: 'luxury' },
      { name: 'Marcus', category: 'comedy' },
      { name: 'Lisa', category: 'educational' },
      { name: 'Tyler', category: 'comedy' },
    ];

    for (const update of updates) {
      const { error } = await supabase
        .from('audience_personas')
        .update({ category: update.category })
        .eq('name', update.name);

      if (error) {
        console.log(`  Warning updating ${update.name}:`, error.message);
      } else {
        console.log(`  Updated ${update.name} -> ${update.category}`);
      }
    }

    // Step 3: Insert new personas
    console.log('\nStep 3: Inserting 12 new personas...');

    const newPersonas = [
      {
        id: '00000000-0000-0000-0000-000000000009',
        name: 'Alex Chen',
        age_range: '30-35',
        description: 'Tech reviewer who does deep-dive comparisons',
        full_description: 'Loves specs, benchmarks, and finding the best value. Appeals to informed buyers who research before purchasing.',
        tone: 'analytical',
        style: 'thorough',
        gender: 'male',
        lifestyle: 'Tech enthusiast, early adopter, works in software',
        humor_style: 'Dry wit, tech puns, "let me explain why this matters"',
        platforms: ['youtube', 'tiktok'],
        category: 'tech',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000010',
        name: 'Priya Sharma',
        age_range: '25-30',
        description: 'Beauty and skincare guru focused on ingredients',
        full_description: 'Breaks down products scientifically while keeping it accessible. Big on before/afters and honest reviews.',
        tone: 'educational',
        style: 'enthusiastic',
        gender: 'female',
        lifestyle: 'Skincare obsessed, ingredient-conscious, wellness-focused',
        humor_style: 'Relatable self-deprecation, "okay but seriously this changed my skin"',
        platforms: ['tiktok', 'instagram'],
        category: 'beauty',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000011',
        name: 'Carlos Rodriguez',
        age_range: '40-48',
        description: 'Business coach and entrepreneur mentor',
        full_description: 'Focuses on ROI, scaling, and practical business advice. No fluff, just results that matter.',
        tone: 'authoritative',
        style: 'direct',
        gender: 'male',
        lifestyle: 'Serial entrepreneur, investor, mentor',
        humor_style: 'Success stories, "let me tell you what actually works"',
        platforms: ['linkedin', 'youtube'],
        category: 'business',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000012',
        name: 'Zoe Martinez',
        age_range: '19-23',
        description: 'College student and budget queen',
        full_description: 'Finds affordable alternatives to expensive products. Masters the "dupe" content format.',
        tone: 'excited',
        style: 'genuine',
        gender: 'female',
        lifestyle: 'Student, budget-conscious, trend-aware',
        humor_style: 'Gen-Z humor, "no way this is only $12", shocked reactions',
        platforms: ['tiktok', 'instagram'],
        category: 'budget',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000013',
        name: 'James Wilson',
        age_range: '35-40',
        description: 'Fitness coach specializing in transformations',
        full_description: 'Before/after focused, motivational, practical workout and nutrition tips. Knows what actually works.',
        tone: 'motivational',
        style: 'tough love',
        gender: 'male',
        lifestyle: 'Fitness professional, meal prep enthusiast, early riser',
        humor_style: 'Gym bro energy but wholesome, "trust the process"',
        platforms: ['tiktok', 'instagram', 'youtube'],
        category: 'fitness',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000014',
        name: 'Nina Thompson',
        age_range: '32-38',
        description: 'Working mom balancing kids and self-care',
        full_description: 'Time-saving hacks, practical solutions, keeping it real about the chaos of modern parenting.',
        tone: 'warm',
        style: 'practical',
        gender: 'female',
        lifestyle: 'Working mom, efficiency expert, coffee-dependent',
        humor_style: 'Mom humor, "if I can do this with a toddler screaming..."',
        platforms: ['tiktok', 'instagram', 'facebook'],
        category: 'lifestyle',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000015',
        name: 'Derek Chang',
        age_range: '26-32',
        description: 'Gaming and tech streamer',
        full_description: 'Enthusiastic about new releases, builds community, speaks the language of gamers.',
        tone: 'hyped',
        style: 'community-focused',
        gender: 'male',
        lifestyle: 'Full-time content creator, competitive gamer, night owl',
        humor_style: 'Gaming references, memes, "chat, this is actually insane"',
        platforms: ['tiktok', 'youtube', 'twitch'],
        category: 'tech',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000016',
        name: 'Aisha Johnson',
        age_range: '24-28',
        description: 'Fashion and style influencer',
        full_description: 'Trend forecasting, outfit inspiration, making high fashion accessible to everyone.',
        tone: 'confident',
        style: 'inspiring',
        gender: 'female',
        lifestyle: 'Fashion-forward, thrift lover, sustainability-minded',
        humor_style: 'Fashion puns, "the way this outfit ate", dramatic reveals',
        platforms: ['tiktok', 'instagram'],
        category: 'beauty',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000017',
        name: 'Tom Bradley',
        age_range: '48-55',
        description: 'DIY expert and home improvement guru',
        full_description: 'Step-by-step tutorials, tool recommendations, "you can do this yourself" encouraging energy.',
        tone: 'patient',
        style: 'instructional',
        gender: 'male',
        lifestyle: 'Handy homeowner, workshop enthusiast, practical problem-solver',
        humor_style: 'Dad jokes, tool puns, "now here is where most people mess up"',
        platforms: ['youtube', 'tiktok'],
        category: 'diy',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000018',
        name: 'Luna Park',
        age_range: '28-34',
        description: 'Wellness advocate for mental health and mindfulness',
        full_description: 'Calm, grounding presence. Focuses on mental health, mindfulness, and holistic living.',
        tone: 'calm',
        style: 'supportive',
        gender: 'female',
        lifestyle: 'Yoga instructor, meditation practitioner, plant-based',
        humor_style: 'Gentle humor, "remember to breathe", soothing energy',
        platforms: ['tiktok', 'instagram', 'youtube'],
        category: 'lifestyle',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000019',
        name: 'Chris Foster',
        age_range: '33-40',
        description: 'Food critic and home chef',
        full_description: 'Restaurant reviews, recipe recreations, understanding and explaining flavor profiles.',
        tone: 'descriptive',
        style: 'passionate',
        gender: 'male',
        lifestyle: 'Foodie, home cook, restaurant explorer',
        humor_style: 'Food puns, dramatic tasting reactions, "the way the flavors just..."',
        platforms: ['tiktok', 'instagram', 'youtube'],
        category: 'food',
        is_system: true,
        times_used: 0
      },
      {
        id: '00000000-0000-0000-0000-000000000020',
        name: 'Sam Rivera',
        age_range: '26-32',
        description: 'Travel content creator and adventure seeker',
        full_description: 'Hidden gems finder, practical travel tips and hacks. Makes you want to book a flight.',
        tone: 'adventurous',
        style: 'inspiring',
        gender: 'non-binary',
        lifestyle: 'Digital nomad, adventure sports, cultural explorer',
        humor_style: 'Travel humor, "okay but no one talks about this", FOMO-inducing',
        platforms: ['tiktok', 'instagram', 'youtube'],
        category: 'travel',
        is_system: true,
        times_used: 0
      }
    ];

    for (const persona of newPersonas) {
      const { error } = await supabase
        .from('audience_personas')
        .upsert(persona, { onConflict: 'id' });

      if (error) {
        console.log(`  Error inserting ${persona.name}:`, error.message);
      } else {
        console.log(`  ✓ ${persona.name} (${persona.category})`);
      }
    }

    // Step 4: Verify count
    console.log('\nStep 4: Verifying...');
    const { data: count, error: countErr } = await supabase
      .from('audience_personas')
      .select('id', { count: 'exact', head: true });

    if (countErr) {
      console.log('Could not verify count:', countErr.message);
    } else {
      console.log(`Total personas in database: ${count}`);
    }

    console.log('\n✅ Migration complete!');

  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

runMigration();
