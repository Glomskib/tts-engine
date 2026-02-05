/**
 * Winners Bank API Functions
 *
 * Database operations for the winners system.
 * Maps between TypeScript field names (API contract) and actual DB column names.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Winner, WinnerPatterns, WinnersIntelligence, CreateWinnerInput, UpdateWinnerInput } from './types';

/**
 * Map TypeScript CreateWinnerInput fields to actual DB column names.
 * The winners_bank table uses different column names than the TypeScript types.
 */
function toDbColumns(input: CreateWinnerInput | UpdateWinnerInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if (input.source_type !== undefined) {
    // DB CHECK allows 'our_script' | 'external'; map 'generated' → 'our_script'
    row.source_type = input.source_type === 'generated' ? 'our_script' : input.source_type;
  }
  if (input.script_id !== undefined) row.script_id = input.script_id;
  if (input.hook !== undefined) row.hook_text = input.hook;
  if (input.video_url !== undefined) row.tiktok_url = input.video_url;
  if (input.thumbnail_url !== undefined) row.thumbnail_url = input.thumbnail_url;
  if (input.notes !== undefined) row.user_notes = input.notes;
  if (input.hook_type !== undefined) row.hook_type = input.hook_type;
  if (input.content_format !== undefined) row.content_format = input.content_format;
  if (input.product_category !== undefined) row.product_category = input.product_category;
  if (input.view_count !== undefined) row.views = input.view_count;
  if (input.like_count !== undefined) row.likes = input.like_count;
  if (input.comment_count !== undefined) row.comments = input.comment_count;
  if (input.share_count !== undefined) row.shares = input.share_count;
  if (input.save_count !== undefined) row.saves = input.save_count;
  if (input.engagement_rate !== undefined) row.engagement_rate = input.engagement_rate;
  if (input.retention_3s !== undefined) row.retention_3s = input.retention_3s;
  if (input.retention_5s !== undefined) row.retention_half = input.retention_5s;
  if (input.retention_10s !== undefined) row.retention_full = input.retention_10s;
  if (input.avg_watch_time !== undefined) row.avg_watch_time_seconds = input.avg_watch_time;
  if (input.posted_at !== undefined) row.posted_at = input.posted_at;

  return row;
}

/**
 * Map a DB row back to the TypeScript Winner interface.
 */
function fromDbRow(row: Record<string, unknown>): Winner {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    source_type: (row.source_type === 'our_script' ? 'generated' : row.source_type) as Winner['source_type'],
    script_id: row.script_id as string | null,
    hook: (row.hook_text as string) ?? null,
    video_url: (row.tiktok_url as string) ?? null,
    thumbnail_url: (row.thumbnail_url as string) ?? null,
    notes: (row.user_notes as string) ?? null,
    hook_type: (row.hook_type as Winner['hook_type']) ?? null,
    content_format: (row.content_format as Winner['content_format']) ?? null,
    product_category: (row.product_category as string) ?? null,
    view_count: (row.views as number) ?? null,
    like_count: (row.likes as number) ?? null,
    comment_count: (row.comments as number) ?? null,
    share_count: (row.shares as number) ?? null,
    save_count: (row.saves as number) ?? null,
    engagement_rate: (row.engagement_rate as number) ?? null,
    retention_3s: (row.retention_3s as number) ?? null,
    retention_5s: (row.retention_half as number) ?? null,
    retention_10s: (row.retention_full as number) ?? null,
    avg_watch_time: (row.avg_watch_time_seconds as number) ?? null,
    ai_analysis: (row.ai_analysis as Winner['ai_analysis']) ?? null,
    patterns: (row.extracted_patterns as Winner['patterns']) ?? null,
    performance_score: (row.performance_score as number) ?? null,
    posted_at: (row.posted_at as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Fetch winners for a user with optional filters
 */
export async function fetchWinners(
  userId: string,
  options: {
    sourceType?: 'generated' | 'external';
    category?: string;
    tag?: string;
    sort?: 'performance_score' | 'views' | 'engagement' | 'recent';
    limit?: number;
  } = {}
): Promise<{ winners: Winner[]; error?: string }> {
  const { sourceType, category, sort = 'performance_score', limit = 20 } = options;

  try {
    let query = supabaseAdmin
      .from('winners_bank')
      .select('*')
      .eq('user_id', userId);

    if (sourceType) {
      // Map 'generated' → 'our_script' for DB query
      const dbSourceType = sourceType === 'generated' ? 'our_script' : sourceType;
      query = query.eq('source_type', dbSourceType);
    }

    if (category) {
      query = query.eq('product_category', category);
    }

    // Sorting - use actual DB column names
    switch (sort) {
      case 'views':
        query = query.order('views', { ascending: false, nullsFirst: false });
        break;
      case 'engagement':
        query = query.order('engagement_rate', { ascending: false, nullsFirst: false });
        break;
      case 'recent':
        query = query.order('created_at', { ascending: false });
        break;
      default:
        query = query.order('performance_score', { ascending: false, nullsFirst: false });
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      return { winners: [], error: error.message };
    }

    const winners = (data || []).map((row: Record<string, unknown>) => fromDbRow(row));
    return { winners };
  } catch (err) {
    console.error('fetchWinners error:', err);
    return { winners: [], error: 'Failed to fetch winners' };
  }
}

/**
 * Fetch a single winner by ID
 */
export async function fetchWinnerById(
  winnerId: string,
  userId: string
): Promise<{ winner: Winner | null; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('winners_bank')
      .select('*')
      .eq('id', winnerId)
      .eq('user_id', userId)
      .single();

    if (error) {
      return { winner: null, error: error.message };
    }

    return { winner: data ? fromDbRow(data as Record<string, unknown>) : null };
  } catch (err) {
    console.error('fetchWinnerById error:', err);
    return { winner: null, error: 'Failed to fetch winner' };
  }
}

/**
 * Create a new winner entry
 */
export async function createWinner(
  userId: string,
  input: CreateWinnerInput
): Promise<{ winner: Winner | null; error?: string }> {
  try {
    const dbRow = toDbColumns(input);
    dbRow.user_id = userId;

    const { data, error } = await supabaseAdmin
      .from('winners_bank')
      .insert(dbRow)
      .select()
      .single();

    if (error) {
      return { winner: null, error: error.message };
    }

    return { winner: data ? fromDbRow(data as Record<string, unknown>) : null };
  } catch (err) {
    console.error('createWinner error:', err);
    return { winner: null, error: 'Failed to create winner' };
  }
}

/**
 * Update a winner entry
 */
export async function updateWinner(
  winnerId: string,
  userId: string,
  input: UpdateWinnerInput
): Promise<{ winner: Winner | null; error?: string }> {
  try {
    const dbRow = toDbColumns(input);

    const { data, error } = await supabaseAdmin
      .from('winners_bank')
      .update(dbRow)
      .eq('id', winnerId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return { winner: null, error: error.message };
    }

    return { winner: data ? fromDbRow(data as Record<string, unknown>) : null };
  } catch (err) {
    console.error('updateWinner error:', err);
    return { winner: null, error: 'Failed to update winner' };
  }
}

/**
 * Delete a winner entry (hard delete)
 */
export async function deleteWinner(
  winnerId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from('winners_bank')
      .delete()
      .eq('id', winnerId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('deleteWinner error:', err);
    return { success: false, error: 'Failed to delete winner' };
  }
}

/**
 * Fetch aggregated patterns for a user
 */
export async function fetchWinnerPatterns(
  userId: string
): Promise<{ patterns: WinnerPatterns | null; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('winner_patterns')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      return { patterns: null, error: error.message };
    }

    return { patterns: data as WinnerPatterns | null };
  } catch (err) {
    console.error('fetchWinnerPatterns error:', err);
    return { patterns: null, error: 'Failed to fetch patterns' };
  }
}

/**
 * Fetch winners intelligence for script generation
 * Returns top winners and aggregated patterns
 */
export async function fetchWinnersIntelligence(
  userId: string
): Promise<WinnersIntelligence | null> {
  try {
    // Fetch top winners
    const { winners, error: winnersError } = await fetchWinners(userId, {
      sort: 'performance_score',
      limit: 10,
    });

    if (winnersError || winners.length === 0) {
      return null;
    }

    // Fetch aggregated patterns
    const { patterns } = await fetchWinnerPatterns(userId);

    return {
      winners,
      patterns,
      totalCount: winners.length,
    };
  } catch (err) {
    console.error('fetchWinnersIntelligence error:', err);
    return null;
  }
}

/**
 * Update winner with AI analysis results.
 * Stores analysis in ai_analysis and extracted patterns in patterns.
 */
export async function updateWinnerAnalysis(
  winnerId: string,
  analysis: Record<string, unknown>,
  extractedPatterns: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from('winners_bank')
      .update({
        ai_analysis: analysis,
        extracted_patterns: extractedPatterns,
      })
      .eq('id', winnerId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('updateWinnerAnalysis error:', err);
    return { success: false, error: 'Failed to update analysis' };
  }
}
