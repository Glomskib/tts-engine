import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — FlashFlow AI | Plans for Creators, Brands & Agencies',
  description:
    'Start free with 5 scripts/month. Upgrade to Creator Lite ($9), Creator Pro ($29), Brand ($49), or Agency ($149) for unlimited AI-powered TikTok Shop scripts.',
  openGraph: {
    title: 'FlashFlow AI Pricing — Plans That Grow With You',
    description:
      'AI-powered TikTok Shop scripts from $0/mo. 5 tiers: Free, Creator Lite, Creator Pro, Brand, and Agency.',
    url: 'https://flashflowai.com/pricing',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
