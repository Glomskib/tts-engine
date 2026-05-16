// OG card for /blog/reverse-engineer-winning-tiktok-shop-videos
import {
  ACCENT_ROSE,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ogImageFromConfig,
} from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'How to Reverse-Engineer Winning TikTok Shop Videos — FlashFlow AI';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI · Blog',
    badge: 'Strategy',
    titleLead: 'Reverse-engineer the ',
    titleHighlight: 'TikTok Shop winners.',
    subtitle: 'Hook, pacing, on-screen text, CTA — break apart what worked and copy the pattern.',
    footerTags: ['Free read', 'Winners', 'Pattern', 'Strategy'],
    url: 'flashflowai.com/blog',
    accent: ACCENT_ROSE,
  });
}
