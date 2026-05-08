import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing & Plans | FlashFlow AI',
  description: 'Pick the right FlashFlow AI plan. Free unlimited transcripts. Upgrade for the AI video editor, clip generator, posting queue, and rendering pipeline.',
  openGraph: {
    title: 'Pricing & Plans | FlashFlow AI',
    description: 'Pick the right FlashFlow AI plan. Free unlimited transcripts. Upgrade for the AI editor, clipper, posting queue, and rendering.',
    images: [{ url: '/FFAI.png', width: 512, height: 512, alt: 'FlashFlow AI Logo' }],
    type: 'website',
  },
  alternates: {
    canonical: 'https://flashflowai.com/upgrade',
  },
};

export default function UpgradeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
