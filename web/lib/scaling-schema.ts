import { supabaseAdmin } from './supabaseAdmin';

// Cache for schema columns to avoid repeated queries
let variantsScalingColumnsCache: Set<string> | null = null;
let iterationGroupsColumnsCache: Set<string> | null = null;

export async function getVariantsScalingColumns(): Promise<Set<string>> {
  if (variantsScalingColumnsCache) {
    return variantsScalingColumnsCache;
  }

  const columns = new Set<string>();
  
  // Probe for parent_variant_id column
  try {
    await supabaseAdmin.from('variants').select('parent_variant_id').limit(1);
    columns.add('parent_variant_id');
  } catch (e) {
    // Column doesn't exist
  }
  
  // Probe for iteration_group_id column
  try {
    await supabaseAdmin.from('variants').select('iteration_group_id').limit(1);
    columns.add('iteration_group_id');
  } catch (e) {
    // Column doesn't exist
  }

  variantsScalingColumnsCache = columns;
  return columns;
}

export async function getIterationGroupsColumns(): Promise<Set<string>> {
  if (iterationGroupsColumnsCache) {
    return iterationGroupsColumnsCache;
  }

  const columns = new Set<string>();
  
  // Probe for iteration_groups table existence and basic columns
  try {
    await supabaseAdmin.from('iteration_groups').select('id').limit(1);
    // If we get here, table exists - add expected columns
    columns.add('id');
    columns.add('winner_variant_id');
    columns.add('concept_id');
    columns.add('plan_json');
    columns.add('status');
    columns.add('error_message');
    columns.add('created_at');
    columns.add('updated_at');
  } catch (e) {
    // Table doesn't exist
  }

  iterationGroupsColumnsCache = columns;
  return columns;
}

// Clear cache when needed (e.g., after migrations)
export function clearScalingSchemaCache() {
  variantsScalingColumnsCache = null;
  iterationGroupsColumnsCache = null;
}

// Valid change types for scaling
export const VALID_CHANGE_TYPES = ['hook', 'on_screen_text', 'cta', 'caption', 'edit_style'] as const;
export type ChangeType = typeof VALID_CHANGE_TYPES[number];
