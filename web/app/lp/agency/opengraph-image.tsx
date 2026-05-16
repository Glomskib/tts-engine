// ============================================================
// OG card for /lp/agency — teal accent, agency pitch.
// ============================================================

import { ACCENT_TEAL, OG_CONTENT_TYPE, OG_SIZE, ogImageFromConfig } from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'FlashFlow AI — AI Content Platform for Agencies';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI',
    badge: 'Built for Agencies',
    titleLead: 'Scale client content ',
    titleHighlight: 'without scaling headcount.',
    subtitle:
      'Multi-brand workspaces. Team seats. Unlimited AI script generation. Built for agencies running 10+ clients.',
    footerTags: ['Multi-brand', 'Team seats', 'White-label', 'Try free'],
    url: 'flashflowai.com/lp/agency',
    accent: ACCENT_TEAL,
  });
}
