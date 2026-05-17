import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Upgrade to Pro | FlashFlow AI' },
  description: 'Unlock the full FlashFlow Pro toolkit — unlimited renders, advanced AI editor modes, custom branding, priority support, and the complete viral content engine.',
  openGraph: {
    title: { absolute: 'Upgrade to Pro | FlashFlow AI' },
    description: 'Unlock the full FlashFlow Pro toolkit — unlimited renders, advanced AI editor, custom branding, priority support.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
    type: 'website',
  },
  alternates: {
    canonical: 'https://flashflowai.com/upgrade-pro',
  },
};

export default function UpgradeProLayout({ children }: { children: React.ReactNode }) {
  return children;
}
