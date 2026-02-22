/**
 * Supabase CRUD for ff_creator_sources, ff_creator_samples, ff_creator_fingerprint.
 *
 * Creates its own client to avoid @/ alias issues when run via tsx.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SampleAnalysis, Screenshot, HookAnalysis, CreatorFingerprint } from './types';

const TAG = '[creator-style:db]';

// ── Supabase admin client (service role) ──

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(`${TAG} NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required`);
  }

  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// ── ff_creator_sources ──

export interface SourceRow {
  id: string;
  creator_key: string;
  platform: string;
  url: string;
  status: string;
  created_at: string;
}

export async function upsertSources(
  creatorKey: string,
  urls: Array<{ url: string; platform: 'tiktok' | 'youtube' }>,
): Promise<{ ok: boolean; count: number }> {
  const client = getClient();

  const rows = urls.map(({ url, platform }) => ({
    creator_key: creatorKey,
    platform,
    url,
    status: 'pending',
  }));

  const { error } = await client
    .from('ff_creator_sources')
    .upsert(rows, { onConflict: 'creator_key,url', ignoreDuplicates: true });

  if (error) {
    console.error(`${TAG} upsertSources failed:`, error.message);
    return { ok: false, count: 0 };
  }

  console.log(`${TAG} Upserted ${rows.length} sources for ${creatorKey}`);
  return { ok: true, count: rows.length };
}

export async function getSourcesByStatus(
  creatorKey: string,
  status: string,
): Promise<SourceRow[]> {
  const client = getClient();

  const { data, error } = await client
    .from('ff_creator_sources')
    .select('*')
    .eq('creator_key', creatorKey)
    .eq('status', status)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`${TAG} getSourcesByStatus failed:`, error.message);
    return [];
  }

  return (data ?? []) as SourceRow[];
}

export async function updateSourceStatus(
  creatorKey: string,
  url: string,
  status: 'pending' | 'processing' | 'done' | 'failed',
): Promise<void> {
  const client = getClient();

  const { error } = await client
    .from('ff_creator_sources')
    .update({ status })
    .eq('creator_key', creatorKey)
    .eq('url', url);

  if (error) {
    console.error(`${TAG} updateSourceStatus failed:`, error.message);
  }
}

// ── ff_creator_samples ──

export interface SampleRow {
  id: string;
  creator_key: string;
  platform: string;
  url: string;
  transcript: string | null;
  ocr_text: string | null;
  visual_notes: string | null;
  hooks: HookAnalysis[] | null;
  screenshots: Screenshot[] | null;
  duration_seconds: number | null;
  analysis: SampleAnalysis | null;
  created_at: string;
}

export async function upsertSample(params: {
  creator_key: string;
  platform: string;
  url: string;
  transcript: string | null;
  ocr_text: string | null;
  visual_notes: string | null;
  hooks: HookAnalysis[] | null;
  screenshots: Screenshot[] | null;
  duration_seconds: number | null;
  analysis: SampleAnalysis | null;
}): Promise<{ ok: boolean }> {
  const client = getClient();

  const { error } = await client
    .from('ff_creator_samples')
    .upsert(params, { onConflict: 'creator_key,url' });

  if (error) {
    console.error(`${TAG} upsertSample failed:`, error.message);
    return { ok: false };
  }

  return { ok: true };
}

export async function getSamplesForCreator(creatorKey: string): Promise<SampleRow[]> {
  const client = getClient();

  const { data, error } = await client
    .from('ff_creator_samples')
    .select('*')
    .eq('creator_key', creatorKey)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`${TAG} getSamplesForCreator failed:`, error.message);
    return [];
  }

  return (data ?? []) as SampleRow[];
}

// ── ff_creator_fingerprint ──

export async function upsertFingerprint(fp: CreatorFingerprint): Promise<{ ok: boolean }> {
  const client = getClient();

  const { error } = await client
    .from('ff_creator_fingerprint')
    .upsert({
      creator_key: fp.creator_key,
      summary: fp.summary,
      hook_patterns: fp.hook_patterns,
      structure_rules: fp.structure_rules,
      banned_phrases: fp.banned_phrases,
      do_list: fp.do_list,
      dont_list: fp.dont_list,
      samples_count: fp.samples_count,
      version: fp.version,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'creator_key' });

  if (error) {
    console.error(`${TAG} upsertFingerprint failed:`, error.message);
    return { ok: false };
  }

  console.log(`${TAG} Fingerprint saved for ${fp.creator_key} (v${fp.version}, ${fp.samples_count} samples)`);
  return { ok: true };
}

export async function getFingerprint(creatorKey: string): Promise<CreatorFingerprint | null> {
  const client = getClient();

  const { data, error } = await client
    .from('ff_creator_fingerprint')
    .select('*')
    .eq('creator_key', creatorKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    console.error(`${TAG} getFingerprint failed:`, error.message);
    return null;
  }

  return data as CreatorFingerprint;
}
