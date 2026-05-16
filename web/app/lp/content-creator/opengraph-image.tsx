// ============================================================
// OG card for /lp/content-creator — violet accent, creator pitch.
// ============================================================

import { ACCENT_VIOLET, OG_CONTENT_TYPE, OG_SIZE, ogImageFromConfig } from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'FlashFlow AI — AI Script Writer for Content Creators';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI',
    badge: 'Built for Content Creators',
    titleLead: 'Stop staring at blank scripts. ',
    titleHighlight: 'Start going viral.',
    subtitle:
      '20+ persona voices. Hook generator. Post consistently without writer’s block. Free to try.',
    footerTags: ['Free', '20+ voices', 'Hook gen', 'TikTok + Reels'],
    url: 'flashflowai.com/lp/content-creator',
    accent: ACCENT_VIOLET,
  });
}
