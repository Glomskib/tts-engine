// OG card for /blog/10-tiktok-hook-formulas
import {
  ACCENT_ROSE,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ogImageFromConfig,
} from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '10 TikTok Hook Formulas That Actually Go Viral — FlashFlow AI';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI · Blog',
    badge: 'Hooks',
    titleLead: '10 hook formulas that ',
    titleHighlight: 'actually go viral.',
    subtitle: 'Pattern-tested across thousands of TikToks. Steal them.',
    footerTags: ['Free read', 'TikTok', 'Hooks', 'Patterns'],
    url: 'flashflowai.com/blog',
    accent: ACCENT_ROSE,
  });
}
