/**
 * SKU Slug builder — generates folder names and filename tokens
 * from a content item + optional brand/product context.
 *
 * Example output:
 *   folderName:    "20260304__brand-hopwater__prod-peach6pk__FF-7a3b2c__Hop-Water-Peach-UGC"
 *   filenameToken: "[FF-7a3b2c]"
 *   shortId:       "FF-7a3b2c"
 */

export interface SkuSlugResult {
  folderName: string;
  filenameToken: string;
  shortId: string;
}

function slugify(text: string, maxLen: number): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export function buildSkuSlug(
  item: { short_id: string; title: string; due_at?: string | null; created_at: string },
  brand?: { name: string } | null,
  product?: { name: string } | null,
): SkuSlugResult {
  const datePart = formatDate(item.due_at || item.created_at);
  const brandPart = brand ? `brand-${slugify(brand.name, 15)}` : 'brand-none';
  const productPart = product ? `prod-${slugify(product.name, 15)}` : 'prod-none';
  const titlePart = slugify(item.title, 25);

  const folderName = [datePart, brandPart, productPart, item.short_id, titlePart]
    .filter(Boolean)
    .join('__');

  return {
    folderName,
    filenameToken: `[${item.short_id}]`,
    shortId: item.short_id,
  };
}
