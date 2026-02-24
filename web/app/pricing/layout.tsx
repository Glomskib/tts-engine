import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — FlashFlow AI | Plans for Creators & Businesses',
  description:
    'Start free with 5 scripts/month. Upgrade to Creator Lite ($9), Creator Pro ($29), or Business ($59) for unlimited AI-powered TikTok Shop scripts. Brand & Agency plans available.',
  openGraph: {
    title: 'FlashFlow AI Pricing — Plans That Grow With You',
    description:
      'AI-powered TikTok Shop scripts from $0/mo. 4 tiers: Free, Creator Lite, Creator Pro, and Business. Enterprise plans available.',
    url: 'https://flashflowai.com/pricing',
    images: [{ url: '/FFAI.png', width: 512, height: 512, alt: 'FlashFlow AI Logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'FlashFlow AI Pricing — Plans That Grow With You',
    description: 'AI-powered TikTok Shop scripts from $0/mo. Free, Lite, Creator Pro, and Business tiers.',
    images: ['/FFAI.png'],
  },
  alternates: {
    canonical: 'https://flashflowai.com/pricing',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
