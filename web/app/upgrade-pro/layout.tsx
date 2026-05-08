import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Upgrade to Pro | FlashFlow AI',
  description: 'Unlock the full FlashFlow Pro toolkit — unlimited renders, advanced AI editor modes, custom branding, priority support, and the complete viral content engine.',
  openGraph: {
    title: 'Upgrade to Pro | FlashFlow AI',
    description: 'Unlock the full FlashFlow Pro toolkit — unlimited renders, advanced AI editor, custom branding, priority support.',
    images: [{ url: '/FFAI.png', width: 512, height: 512, alt: 'FlashFlow AI Logo' }],
    type: 'website',
  },
  alternates: {
    canonical: 'https://flashflowai.com/upgrade-pro',
  },
};

export default function UpgradeProLayout({ children }: { children: React.ReactNode }) {
  return children;
}
