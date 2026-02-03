/**
 * Brand Context Module
 * Fetches and formats brand information for AI script generation
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface BrandContext {
  name: string;
  tone_of_voice?: string | null;
  target_audience?: string | null;
  guidelines?: string | null;
  colors?: string[] | null;
}

/**
 * Fetch brand context from database
 */
export async function fetchBrandContext(brandId: string): Promise<BrandContext | null> {
  if (!brandId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('brands')
      .select('name, tone_of_voice, target_audience, guidelines, colors')
      .eq('id', brandId)
      .single();

    if (error || !data) return null;
    return data as BrandContext;
  } catch {
    return null;
  }
}

/**
 * Build brand context prompt section for AI
 */
export function buildBrandContextPrompt(brand: BrandContext | null): string {
  if (!brand) return '';

  // Check if brand has any meaningful context
  const hasContext = brand.tone_of_voice || brand.target_audience || brand.guidelines;
  if (!hasContext) return '';

  let context = `\n=== BRAND CONTEXT: ${brand.name} ===\n`;

  if (brand.tone_of_voice) {
    context += `BRAND VOICE & TONE:\n${brand.tone_of_voice}\n\n`;
  }

  if (brand.target_audience) {
    context += `TARGET AUDIENCE:\n${brand.target_audience}\n\n`;
  }

  if (brand.guidelines) {
    context += `BRAND GUIDELINES (must follow):\n${brand.guidelines}\n\n`;
  }

  context += `CRITICAL: The script must align with this brand's voice and guidelines. Do not contradict brand positioning.\n`;
  context += `===\n`;

  return context;
}
