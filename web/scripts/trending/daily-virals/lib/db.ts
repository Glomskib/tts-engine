/**
 * Database persistence + Supabase Storage for Daily Virals trending data.
 *
 * - Upserts items to ff_trending_items (idempotent by source+run_date+rank)
 * - Uploads screenshots to Supabase Storage bucket "trending"
 * - Fetches items for API consumption
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TrendingItem } from './types';

const TAG = '[daily-virals:db]';
const STORAGE_BUCKET = 'trending';

// ── Supabase admin client (service role) ──

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn(`${TAG} Supabase env vars not set — DB operations disabled`);
    return null;
  }

  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// ── Types ──

export interface DBTrendingItem {
  id: string;
  source: string;
  run_date: string;
  rank: number;
  product_name: string;
  tiktok_product_id: string | null;
  category: string | null;
  gmv_velocity: string | null;
  views: string | null;
  hook_text: string | null;
  on_screen_hook: string | null;
  script_snippet: string | null;
  visual_notes: string | null;
  source_url: string;
  screenshot_urls: string[] | null;
  raw: Record<string, unknown>;
  created_at: string;
}

// ── Upsert items ──

export async function upsertTrendingItems(
  items: TrendingItem[],
  runDate: string,
  screenshotUrlMap?: Map<number, string[]>,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false, count: 0, error: 'No Supabase client' };

  const rows = items.map(item => ({
    source: 'daily_virals',
    run_date: runDate,
    rank: item.rank,
    product_name: item.product_name || item.title,
    tiktok_product_id: null,
    category: item.category || null,
    gmv_velocity: item.metrics.gmv || item.metrics.velocity || null,
    views: item.metrics.views || null,
    hook_text: item.hook_text || null,
    on_screen_hook: null,
    script_snippet: item.script_snippet || null,
    visual_notes: item.ai_observation || null,
    source_url: item.source_url || '',
    screenshot_urls: screenshotUrlMap?.get(item.rank) ?? null,
    raw: {
      title: item.title,
      metrics: item.metrics,
      thumbnail_url: item.thumbnail_url,
      captured_at: item.captured_at,
    },
  }));

  const { error } = await client
    .from('ff_trending_items')
    .upsert(rows, { onConflict: 'source,run_date,rank' });

  if (error) {
    console.error(`${TAG} Upsert failed:`, error.message);
    return { ok: false, count: 0, error: error.message };
  }

  console.log(`${TAG} Upserted ${rows.length} items for ${runDate}`);
  return { ok: true, count: rows.length };
}

// ── Screenshot upload ──

export async function uploadScreenshots(
  screenshotPaths: string[],
  runDate: string,
  source: string = 'daily_virals',
): Promise<Map<number, string[]>> {
  const client = getClient();
  const urlMap = new Map<number, string[]>();

  if (!client) {
    console.warn(`${TAG} No Supabase client — screenshots stored locally only`);
    return urlMap;
  }

  // Ensure bucket exists (no-op if already present)
  await ensureBucket(client);

  for (const filePath of screenshotPaths) {
    const filename = path.basename(filePath);
    // Extract rank from filename like "01-product-name.png" or "00-full-page.png"
    const rankMatch = filename.match(/^(\d+)-/);
    if (!rankMatch) continue;

    const rank = parseInt(rankMatch[1], 10);
    if (rank === 0) continue; // skip full-page screenshot

    const storagePath = `${runDate}/${source}/${filename}`;

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const { error } = await client.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (error) {
        console.warn(`${TAG} Upload failed for ${filename}: ${error.message}`);
        continue;
      }

      const { data: urlData } = client.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;
      if (!urlMap.has(rank)) urlMap.set(rank, []);
      urlMap.get(rank)!.push(publicUrl);

      console.log(`${TAG} Uploaded ${storagePath}`);
    } catch (err) {
      console.warn(`${TAG} Upload error for ${filename}:`, err);
    }
  }

  return urlMap;
}

async function ensureBucket(client: SupabaseClient): Promise<void> {
  const { data: buckets } = await client.storage.listBuckets();
  const exists = buckets?.some(b => b.name === STORAGE_BUCKET);
  if (!exists) {
    const { error } = await client.storage.createBucket(STORAGE_BUCKET, {
      public: true,
    });
    if (error && !error.message.includes('already exists')) {
      console.warn(`${TAG} Bucket creation failed: ${error.message}`);
    } else {
      console.log(`${TAG} Created storage bucket "${STORAGE_BUCKET}"`);
    }
  }
}

// ── Fetch items (for API) ──

export async function fetchTrendingItems(
  date?: string,
): Promise<{ items: DBTrendingItem[]; date: string }> {
  const client = getClient();
  if (!client) return { items: [], date: date || '' };

  let query = client
    .from('ff_trending_items')
    .select('*')
    .eq('source', 'daily_virals')
    .order('rank', { ascending: true });

  if (date) {
    query = query.eq('run_date', date);
  } else {
    // Get most recent run_date
    const { data: latest } = await client
      .from('ff_trending_items')
      .select('run_date')
      .eq('source', 'daily_virals')
      .order('run_date', { ascending: false })
      .limit(1);

    const latestDate = latest?.[0]?.run_date;
    if (!latestDate) return { items: [], date: '' };

    query = query.eq('run_date', latestDate);
    date = latestDate;
  }

  const { data, error } = await query;

  if (error) {
    console.error(`${TAG} Fetch failed:`, error.message);
    return { items: [], date: date || '' };
  }

  return { items: (data ?? []) as DBTrendingItem[], date: date || '' };
}
