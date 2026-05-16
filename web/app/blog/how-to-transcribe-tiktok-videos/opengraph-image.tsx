// OG card for /blog/how-to-transcribe-tiktok-videos
import {
  ACCENT_VIOLET,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ogImageFromConfig,
} from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'How to Transcribe TikTok Videos for Free in 2026 — FlashFlow AI';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI · Blog',
    badge: 'How-to',
    titleLead: 'How to transcribe TikToks ',
    titleHighlight: 'for free in 2026.',
    subtitle: 'Word-level timestamps. AI breakdown of hooks and structure. No signup.',
    footerTags: ['Free tool', 'TikTok', 'Transcript', 'AI breakdown'],
    url: 'flashflowai.com/blog',
    accent: ACCENT_VIOLET,
  });
}
