// OG card for /blog/getting-started
import {
  ACCENT_TEAL,
  OG_CONTENT_TYPE,
  OG_SIZE,
  ogImageFromConfig,
} from '@/lib/og-image-template';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Getting Started with FlashFlow AI — Your First Script in 60 Seconds';
export const dynamic = 'force-static';

export default async function Image() {
  return ogImageFromConfig({
    brand: 'FlashFlow AI · Blog',
    badge: 'Getting Started',
    titleLead: 'Your first script ',
    titleHighlight: 'in 60 seconds.',
    subtitle: 'A two-minute walkthrough. No signup. Real output.',
    footerTags: ['Free', 'Walkthrough', 'No signup', 'Try it'],
    url: 'flashflowai.com/blog',
    accent: ACCENT_TEAL,
  });
}
