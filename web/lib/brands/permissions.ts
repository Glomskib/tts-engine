/**
 * Brand role permission checks.
 *
 * Resolves brand_members role for a given user + brand,
 * used by API routes and middleware to gate access.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { BrandMember } from './types';

export type BrandRole = 'operator' | 'client' | null;

/**
 * Get the user's role for a specific brand.
 * Returns null if no membership exists.
 */
export async function getBrandRole(
  userId: string,
  brandId: string,
): Promise<BrandRole> {
  const { data, error } = await supabaseAdmin
    .from('brand_members')
    .select('role')
    .eq('user_id', userId)
    .eq('brand_id', brandId)
    .single();

  if (error || !data) return null;
  return data.role as BrandRole;
}

/**
 * Get all brand memberships for a user.
 */
export async function getUserBrands(
  userId: string,
): Promise<BrandMember[]> {
  const { data, error } = await supabaseAdmin
    .from('brand_members')
    .select('*')
    .eq('user_id', userId);

  if (error || !data) return [];
  return data as BrandMember[];
}

/**
 * Get all brands (with name) that a user has membership in.
 */
export async function getUserBrandsWithNames(
  userId: string,
): Promise<{ id: string; name: string; role: BrandRole }[]> {
  const { data, error } = await supabaseAdmin
    .from('brand_members')
    .select('brand_id, role, brands:brand_id(id, name)')
    .eq('user_id', userId);

  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => {
    const brand = row.brands as { id: string; name: string } | null;
    return {
      id: brand?.id || (row.brand_id as string),
      name: brand?.name || 'Unknown',
      role: row.role as BrandRole,
    };
  });
}

/**
 * Check if a user is an operator for any brand.
 */
export async function isOperator(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('brand_members')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'operator')
    .limit(1);

  return !error && !!data?.length;
}

/**
 * Check if a user is a client for any brand.
 */
export async function isBrandClient(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('brand_members')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'client')
    .limit(1);

  return !error && !!data?.length;
}
