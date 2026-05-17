import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Welcome — Set Up Your Account | FlashFlow AI' },
  description: 'Quick onboarding to set up your creator profile, niche, and goals — so FlashFlow can tailor scripts, hooks, and analytics to your audience from day one.',
  openGraph: {
    title: { absolute: 'Welcome — Set Up Your Account | FlashFlow AI' },
    description: 'Quick onboarding to set up your creator profile, niche, and goals.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
    type: 'website',
  },
  alternates: {
    canonical: 'https://flashflowai.com/onboarding',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
