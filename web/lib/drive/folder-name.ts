/**
 * Build a Google Drive folder name for a content item.
 *
 * Convention: "FF - {Brand} - {Product} - {Title} - {ShortId}"
 * Example:    "FF - HopWater - Peach 6pk - UGC Review Hook - FF-7a3b2c"
 *
 * Each segment is trimmed to prevent overly long names.
 */

const MAX_SEGMENT = 30;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+$/, '') + '…';
}

export interface FolderNameInput {
  shortId: string;
  title: string;
  brandName?: string | null;
  productName?: string | null;
}

export function buildContentItemFolderName(input: FolderNameInput): string {
  const parts = ['FF'];

  if (input.brandName) {
    parts.push(truncate(input.brandName.trim(), MAX_SEGMENT));
  }

  if (input.productName) {
    parts.push(truncate(input.productName.trim(), MAX_SEGMENT));
  }

  parts.push(truncate(input.title.trim(), MAX_SEGMENT));
  parts.push(input.shortId);

  return parts.join(' - ');
}
