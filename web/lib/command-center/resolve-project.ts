/**
 * Resolve cc_projects rows by name (case-insensitive).
 *
 * Centralises every "find project by name/type" pattern so nothing depends
 * on a slug column that doesn't exist.
 *
 * Lookup order:
 *   1. Exact match on name  (ILIKE)
 *   2. Contains match        (ILIKE %name%)
 *   3. Legacy type fallback   (eq type)   ← for callers that still pass a type key
 *
 * All queries are scoped to status = 'active'.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedProject {
  id: string;
  name: string;
  type: string;
}

/**
 * Resolve a single project by name (case-insensitive).
 * Returns null if not found — callers must handle the miss.
 */
export async function resolveProjectByName(
  sb: SupabaseClient,
  name: string,
): Promise<ResolvedProject | null> {
  if (!name) return null;

  // 1. Exact case-insensitive match
  const { data: exact } = await sb
    .from('cc_projects')
    .select('id, name, type')
    .ilike('name', name)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (exact) return exact as ResolvedProject;

  // 2. Contains match (e.g. "FlashFlow" matches "FlashFlow Platform Core")
  const { data: partial } = await sb
    .from('cc_projects')
    .select('id, name, type')
    .ilike('name', `%${name}%`)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (partial) return partial as ResolvedProject;

  return null;
}

/**
 * Resolve by legacy type column as a last-resort fallback.
 * Used only during migration period for callers that still reference types.
 */
export async function resolveProjectByType(
  sb: SupabaseClient,
  type: string,
): Promise<ResolvedProject | null> {
  if (!type) return null;

  const { data } = await sb
    .from('cc_projects')
    .select('id, name, type')
    .eq('type', type)
    .eq('status', 'active')
    .limit(1)
    .single();

  return data ? (data as ResolvedProject) : null;
}

/**
 * Build a full lookup map: lowercased name → id AND type → id.
 * Useful for batch operations (brain_dispatcher).
 */
export async function buildProjectLookup(
  sb: SupabaseClient,
): Promise<Map<string, ResolvedProject>> {
  const { data: projects } = await sb
    .from('cc_projects')
    .select('id, name, type')
    .eq('status', 'active');

  const map = new Map<string, ResolvedProject>();
  for (const p of projects || []) {
    const proj = p as ResolvedProject;
    // Index by lowercased name
    map.set(proj.name.toLowerCase(), proj);
    // Index by type (legacy compat)
    map.set(proj.type, proj);
  }
  return map;
}

// ── Canonical project names ────────────────────────────────────
// Keep in sync with the seed migration.

export const CANONICAL_NAMES = {
  FLASHFLOW: 'FlashFlow',
  MMM: 'MMM',
  ZEBBYS_WORLD: "Zebby's World",
} as const;

/** Map from Obsidian vault project key → canonical cc_projects.name */
export const VAULT_TO_PROJECT_NAME: Record<string, string> = {
  FlashFlow: CANONICAL_NAMES.FLASHFLOW,
  MMM: CANONICAL_NAMES.MMM,
  ZebbysWorld: CANONICAL_NAMES.ZEBBYS_WORLD,
};
