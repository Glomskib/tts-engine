import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free TikTok Script Generator | AI-Powered',
  description:
    'Generate scroll-stopping TikTok scripts in seconds. Choose from 20+ creator personas, set your tone, and get a ready-to-film script with hooks, dialogue, and CTAs. Free — no sign up required.',
  keywords: [
    'tiktok script generator',
    'ai script writer',
    'tiktok shop scripts',
    'tiktok content creator tools',
    'free tiktok script',
    'viral tiktok hooks',
    'ugc script generator',
    'tiktok video script',
  ],
  openGraph: {
    title: 'Free TikTok Script Generator | FlashFlow AI',
    description:
      'AI-powered script generator for TikTok creators. Get scroll-stopping hooks, beat-by-beat dialogue, and CTAs in seconds.',
    type: 'website',
    url: 'https://flashflowai.com/script-generator',
    // Point explicitly at the root /opengraph-image dynamic route — the
    // 1200×630 hero card. (Auto-inheritance from app/opengraph-image.tsx
    // doesn't fire when a child segment defines its own openGraph block,
    // which we want for the page-specific title/description above.)
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free TikTok Script Generator | FlashFlow AI',
    description:
      'Generate viral TikTok scripts in seconds. 20+ persona presets, TikTok Shop compliant.',
    images: ['/opengraph-image'],
  },
  alternates: {
    canonical: 'https://flashflowai.com/script-generator',
  },
};

export default function ScriptGeneratorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
