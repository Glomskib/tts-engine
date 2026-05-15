// ============================================================
// FlashFlow AI — Twitter card image (same 1200×630 composition)
//
// Twitter's summary_large_image card and Open Graph use the
// same 1200×630 dimensions, so we re-export the OG implementation
// rather than maintaining two visuals.
// ============================================================

export { default, size, contentType, alt, dynamic } from './opengraph-image';
