/**
 * Product Enrichment Helper
 *
 * Utilities to get/generate product enrichment data for script generation
 */

interface Product {
  id: string;
  name: string;
  brand: string;
  category?: string;
  description?: string | null;
  notes?: string | null;
  price?: number | null;
  product_image_url?: string | null;
  images?: string[];
}

interface EnrichedProductData {
  benefits: string[];
  target_audience_summary: string;
  unique_selling_points: string[];
  hook_angles: string[];
}

/**
 * Parse AI enrichment data from product notes
 *
 * Enrichment is stored in notes with format:
 * === AI ENRICHMENT ===
 * BENEFITS:
 * • benefit 1
 * • benefit 2
 * ...
 */
export function parseEnrichmentFromNotes(notes: string | null): EnrichedProductData | null {
  if (!notes) return null;

  // Check if notes contain enrichment section
  if (!notes.includes('=== AI ENRICHMENT ===')) return null;

  const enriched: EnrichedProductData = {
    benefits: [],
    target_audience_summary: '',
    unique_selling_points: [],
    hook_angles: [],
  };

  // Extract benefits section
  const benefitsMatch = notes.match(/BENEFITS:\s*((?:•[^\n]+\n?)+)/);
  if (benefitsMatch) {
    enriched.benefits = benefitsMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('•'))
      .map(line => line.replace(/^•\s*/, '').trim())
      .filter(Boolean);
  }

  // Extract USPs section
  const uspsMatch = notes.match(/UNIQUE SELLING POINTS:\s*((?:•[^\n]+\n?)+)/);
  if (uspsMatch) {
    enriched.unique_selling_points = uspsMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('•'))
      .map(line => line.replace(/^•\s*/, '').trim())
      .filter(Boolean);
  }

  // Extract price positioning as target audience proxy
  const pricePosMatch = notes.match(/PRICE POSITIONING:\s*([^\n]+)/);
  if (pricePosMatch) {
    enriched.target_audience_summary = pricePosMatch[1].trim();
  }

  return enriched.benefits.length > 0 || enriched.unique_selling_points.length > 0
    ? enriched
    : null;
}

/**
 * Generate enrichment data on-demand via API
 */
export async function generateEnrichmentOnDemand(product: Product): Promise<EnrichedProductData | null> {
  try {
    const response = await fetch('/api/products/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: product.name,
        brand: product.brand,
        category: product.category || 'General',
        description: product.description,
        price: product.price,
      }),
    });

    if (!response.ok) {
      console.error('[productEnrichmentHelper] Failed to generate enrichment:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.ok || !data.data?.enrichment) {
      return null;
    }

    const enrichment = data.data.enrichment;

    // Map to EnrichedProductData format
    return {
      benefits: enrichment.benefits || [],
      target_audience_summary:
        enrichment.target_audiences?.[0]?.segment ||
        enrichment.recommended_price_positioning ||
        '',
      unique_selling_points: enrichment.unique_selling_points || [],
      hook_angles:
        enrichment.hook_angles?.map((h: { example_opening: string }) => h.example_opening) ||
        [],
    };
  } catch (err) {
    console.error('[productEnrichmentHelper] Error generating enrichment:', err);
    return null;
  }
}

/**
 * Get enrichment data for a product
 *
 * Priority:
 * 1. Parse from notes if available
 * 2. Return null if not found (caller can decide to generate on-demand)
 */
export function getProductEnrichment(product: Product): EnrichedProductData | null {
  // Try to parse from notes first
  const fromNotes = parseEnrichmentFromNotes(product.notes || null);
  if (fromNotes) {
    return fromNotes;
  }

  // Return null - caller can decide to generate on-demand
  return null;
}

/**
 * Build product context string for prompts with enrichment data
 */
export function buildEnrichedProductContext(
  product: Product,
  enrichment: EnrichedProductData | null
): string {
  let context = `\n=== PRODUCT ===\n`;
  context += `Name: ${product.name}\n`;
  context += `Brand: ${product.brand}\n`;
  if (product.category) context += `Category: ${product.category}\n`;

  if (enrichment) {
    if (enrichment.benefits.length > 0) {
      context += `\nKey Benefits:\n`;
      enrichment.benefits.slice(0, 5).forEach(benefit => {
        context += `• ${benefit}\n`;
      });
    }

    if (enrichment.unique_selling_points.length > 0) {
      context += `\nUnique Selling Points:\n`;
      enrichment.unique_selling_points.slice(0, 3).forEach(usp => {
        context += `• ${usp}\n`;
      });
    }

    if (enrichment.target_audience_summary) {
      context += `\nTarget Audience: ${enrichment.target_audience_summary}\n`;
    }

    if (enrichment.hook_angles.length > 0) {
      context += `\nProven Hook Angles:\n`;
      enrichment.hook_angles.slice(0, 3).forEach(hook => {
        context += `• "${hook}"\n`;
      });
    }
  } else {
    // Fallback to basic description if no enrichment
    if (product.description) {
      context += `\nDescription: ${product.description}\n`;
    }
  }

  return context;
}
