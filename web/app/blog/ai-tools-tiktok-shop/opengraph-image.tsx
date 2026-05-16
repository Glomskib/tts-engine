// OG card for /blog/ai-tools-tiktok-shop
import {
  ACCENT_TEAL,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ogImageFromConfig,
} from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '5 AI Tools Every TikTok Shop Seller Needs in 2026 — FlashFlow AI';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI · Blog',
    badge: 'TikTok Shop',
    titleLead: '5 AI tools every TikTok Shop seller ',
    titleHighlight: 'needs in 2026.',
    subtitle: 'Tested across real campaigns. Pick the ones that actually move GMV.',
    footerTags: ['Free read', 'TikTok Shop', 'AI', 'GMV'],
    url: 'flashflowai.com/blog',
    accent: ACCENT_TEAL,
  });
}
