/**
 * Product Context Module
 * Fetches and formats product information including pain points for AI script generation
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { PainPoint } from './painPointGenerator';

export interface ProductContext {
  id: string;
  name: string;
  brand: string;
  brand_id?: string | null;
  category: string;
  description?: string | null;
  notes?: string | null;
  pain_points?: PainPoint[] | null;
  product_display_name?: string | null;
}

/**
 * Fetch product context from database
 */
export async function fetchProductContext(productId: string): Promise<ProductContext | null> {
  if (!productId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, name, brand, brand_id, category, description, notes, pain_points, product_display_name')
      .eq('id', productId)
      .single();

    if (error || !data) return null;
    return data as ProductContext;
  } catch {
    return null;
  }
}

/**
 * Build product context prompt section for AI
 */
export function buildProductContextPrompt(product: ProductContext | null): string {
  if (!product) return '';

  let context = `\n=== PRODUCT CONTEXT ===\n`;
  context += `PRODUCT: ${product.name}\n`;
  context += `BRAND: ${product.brand}\n`;
  context += `CATEGORY: ${product.category}\n`;

  if (product.product_display_name) {
    context += `DISPLAY NAME: ${product.product_display_name}\n`;
  }

  if (product.description) {
    context += `\nDESCRIPTION:\n${product.description}\n`;
  }

  if (product.notes) {
    context += `\nNOTES:\n${product.notes}\n`;
  }

  return context;
}

/**
 * Build pain points prompt section for AI
 */
export function buildPainPointsPrompt(painPoints: PainPoint[] | null | undefined): string {
  if (!painPoints || painPoints.length === 0) return '';

  let context = `\n=== TARGET AUDIENCE PAIN POINTS ===\n`;
  context += `The script MUST address at least one of these specific pain points:\n\n`;

  painPoints.forEach((pp, index) => {
    const intensityIcon = pp.intensity === 'severe' ? '!!!' :
                         pp.intensity === 'moderate' ? '!!' : '!';
    const categoryLabel = pp.category.toUpperCase();

    context += `${index + 1}. [${categoryLabel}] ${pp.point} ${intensityIcon}\n`;
    if (pp.hook_angle) {
      context += `   Hook angle: "${pp.hook_angle}"\n`;
    }
    context += '\n';
  });

  context += `CRITICAL REQUIREMENTS:\n`;
  context += `- The hook MUST call out one of these pain points directly\n`;
  context += `- Use language that resonates with someone experiencing these frustrations\n`;
  context += `- Position the product as the solution to these specific problems\n`;
  context += `===\n`;

  return context;
}

/**
 * Get pain points formatted for script coverage tracking
 */
export function getPainPointsForCoverage(painPoints: PainPoint[] | null | undefined): string[] {
  if (!painPoints || painPoints.length === 0) return [];
  return painPoints.map(pp => pp.point);
}

/**
 * Analyze which pain points were addressed in the generated script
 */
export function analyzePainPointCoverage(
  script: string,
  painPoints: PainPoint[] | null | undefined
): { covered: string[]; uncovered: string[]; coverage_score: number } {
  if (!painPoints || painPoints.length === 0) {
    return { covered: [], uncovered: [], coverage_score: 100 };
  }

  const scriptLower = script.toLowerCase();
  const covered: string[] = [];
  const uncovered: string[] = [];

  painPoints.forEach(pp => {
    // Check if key terms from the pain point appear in the script
    const painPointWords = pp.point.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const hookAngleWords = pp.hook_angle?.toLowerCase().split(/\s+/).filter(w => w.length > 4) || [];
    const allWords = [...painPointWords, ...hookAngleWords];

    // Consider it covered if at least 40% of significant words appear
    const matchCount = allWords.filter(word => scriptLower.includes(word)).length;
    const threshold = Math.max(1, Math.floor(allWords.length * 0.4));

    if (matchCount >= threshold) {
      covered.push(pp.point);
    } else {
      uncovered.push(pp.point);
    }
  });

  const coverage_score = painPoints.length > 0
    ? Math.round((covered.length / painPoints.length) * 100)
    : 100;

  return { covered, uncovered, coverage_score };
}
