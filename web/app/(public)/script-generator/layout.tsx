import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free TikTok Script Generator | AI-Powered | FlashFlow AI',
  description:
    'Generate scroll-stopping TikTok scripts in seconds. Choose from 20 creator personas, set your tone, and get a ready-to-film script with hooks, dialogue, and CTAs. Free — no sign up required.',
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
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free TikTok Script Generator | FlashFlow AI',
    description:
      'Generate viral TikTok scripts in seconds. 20 persona presets, TikTok Shop compliant.',
  },
  alternates: {
    canonical: 'https://flashflowai.com/script-generator',
  },
};

export default function ScriptGeneratorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
