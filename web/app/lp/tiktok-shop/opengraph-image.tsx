// ============================================================
// OG card for /lp/tiktok-shop — rose accent, TikTok Shop pitch.
// ============================================================

import { ACCENT_ROSE, OG_CONTENT_TYPE, OG_SIZE, ogImageFromConfig } from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'FlashFlow AI — TikTok Shop Script Generator';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI',
    badge: 'Built for TikTok Shop Sellers',
    titleLead: 'Turn TikTok Shop products into ',
    titleHighlight: 'viral content.',
    subtitle:
      'AI scripts in 60 seconds. 20+ creator personas. TikTok-Shop-compliant. Free to try — no signup.',
    footerTags: ['Free', '20+ personas', 'Shop-compliant', 'No signup'],
    url: 'flashflowai.com/lp/tiktok-shop',
    accent: ACCENT_ROSE,
  });
}
