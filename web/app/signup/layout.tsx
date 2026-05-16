import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up — Free Account | FlashFlow AI',
  description: 'Create your free FlashFlow AI account. Transcribe TikTok and YouTube videos, generate scripts, analyze hooks, and grow your TikTok Shop content engine.',
  openGraph: {
    title: 'Sign Up — Free Account | FlashFlow AI',
    description: 'Create your free FlashFlow AI account. Transcribe, analyze hooks, generate scripts, and grow your TikTok Shop content engine.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
    type: 'website',
  },
  alternates: {
    canonical: 'https://flashflowai.com/signup',
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
