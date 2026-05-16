// ============================================================
// FlashFlow AI — Root Open Graph image (1200×630)
//
// Next.js auto-discovery: by sitting at app/opengraph-image.tsx,
// this file becomes the og:image for the root route ("/"). Next
// injects og:image, og:image:width=1200, og:image:height=630, and
// og:image:type=image/png into <head> automatically.
//
// Shares visuals with /lp/* variants via lib/og-image-template.tsx
// so brand stays consistent.
// ============================================================

import {
  ACCENT_TEAL,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ogImageFromConfig,
} from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt =
  'FlashFlow AI — Growth engine for TikTok Shop affiliates, creators, and brands';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI',
    badge: 'Free to start · No credit card',
    titleLead: 'The growth engine for ',
    titleHighlight: 'TikTok Shop creators.',
    subtitle:
      'Find products, generate hooks, edit videos, publish to TikTok, track commissions — in one tool.',
    footerTags: ['Scripts', 'Clips', 'Publishing', 'Commissions'],
    url: 'flashflowai.com',
    accent: ACCENT_TEAL,
  });
}
