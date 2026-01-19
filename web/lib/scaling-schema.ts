import { supabaseAdmin } from './supabaseAdmin';

// Cache for schema columns to avoid repeated queries
let variantsScalingColumnsCache: Set<string> | null = null;
let iterationGroupsColumnsCache: Set<string> | null = null;

export async function getVariantsScalingColumns(): Promise<Set<string>> {
  if (variantsScalingColumnsCache) {
    return variantsScalingColumnsCache;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'variants')
      .eq('table_schema', 'public');

    if (error) {
      console.error('Failed to fetch variants columns:', error);
      variantsScalingColumnsCache = new Set([]);
      return variantsScalingColumnsCache;
    }

    const columns = new Set(data?.map((row: any) => row.column_name) || []);
    variantsScalingColumnsCache = columns;
    return columns;
  } catch (error) {
    console.error('Error checking variants schema:', error);
    variantsScalingColumnsCache = new Set([]);
    return variantsScalingColumnsCache;
  }
}

export async function getIterationGroupsColumns(): Promise<Set<string>> {
  if (iterationGroupsColumnsCache) {
    return iterationGroupsColumnsCache;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'iteration_groups')
      .eq('table_schema', 'public');

    if (error) {
      console.error('Failed to fetch iteration_groups columns:', error);
      // Return basic expected columns as fallback
      iterationGroupsColumnsCache = new Set(['id', 'winner_variant_id', 'concept_id', 'plan_json', 'created_at', 'updated_at']);
      return iterationGroupsColumnsCache;
    }

    const columns = new Set(data?.map((row: any) => row.column_name) || []);
    iterationGroupsColumnsCache = columns;
    return columns;
  } catch (error) {
    console.error('Error checking iteration_groups schema:', error);
    // Return basic expected columns as fallback
    iterationGroupsColumnsCache = new Set(['id', 'winner_variant_id', 'concept_id', 'plan_json', 'created_at', 'updated_at']);
    return iterationGroupsColumnsCache;
  }
}

// Clear cache when needed (e.g., after migrations)
export function clearScalingSchemaCache() {
  variantsScalingColumnsCache = null;
  iterationGroupsColumnsCache = null;
}

// Valid change types for scaling
export const VALID_CHANGE_TYPES = ['hook', 'on_screen_text', 'cta', 'caption', 'edit_style'] as const;
export type ChangeType = typeof VALID_CHANGE_TYPES[number];
