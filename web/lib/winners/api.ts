/**
 * Winners Bank API Functions
 *
 * Database operations for the winners system
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Winner, WinnerPatterns, WinnersIntelligence, CreateWinnerInput, UpdateWinnerInput } from './types';

/**
 * Fetch winners for a user with optional filters
 */
export async function fetchWinners(
  userId: string,
  options: {
    sourceType?: 'our_script' | 'external';
    category?: string;
    tag?: string;
    sort?: 'performance_score' | 'views' | 'engagement' | 'recent';
    limit?: number;
  } = {}
): Promise<{ winners: Winner[]; error?: string }> {
  const { sourceType, category, tag, sort = 'performance_score', limit = 20 } = options;

  try {
    let query = supabaseAdmin
      .from('winners_bank')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    if (category) {
      query = query.eq('product_category', category);
    }

    if (tag) {
      query = query.contains('tags', [tag]);
    }

    // Sorting
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

    return { winners: (data || []) as Winner[] };
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

    return { winner: data as Winner };
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
    const { data, error } = await supabaseAdmin
      .from('winners_bank')
      .insert({
        user_id: userId,
        ...input,
      })
      .select()
      .single();

    if (error) {
      return { winner: null, error: error.message };
    }

    return { winner: data as Winner };
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
    const { data, error } = await supabaseAdmin
      .from('winners_bank')
      .update(input)
      .eq('id', winnerId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return { winner: null, error: error.message };
    }

    return { winner: data as Winner };
  } catch (err) {
    console.error('updateWinner error:', err);
    return { winner: null, error: 'Failed to update winner' };
  }
}

/**
 * Delete (soft-delete) a winner entry
 */
export async function deleteWinner(
  winnerId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from('winners_bank')
      .update({ is_active: false })
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
 * Update winner with AI analysis
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
        ai_analyzed_at: new Date().toISOString(),
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
