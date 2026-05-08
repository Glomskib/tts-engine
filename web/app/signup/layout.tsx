import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up — Free Account | FlashFlow AI',
  description: 'Create your free FlashFlow AI account. Transcribe TikTok and YouTube videos, generate scripts, analyze hooks, and grow your TikTok Shop content engine.',
  openGraph: {
    title: 'Sign Up — Free Account | FlashFlow AI',
    description: 'Create your free FlashFlow AI account. Transcribe, analyze hooks, generate scripts, and grow your TikTok Shop content engine.',
    images: [{ url: '/FFAI.png', width: 512, height: 512, alt: 'FlashFlow AI Logo' }],
    type: 'website',
  },
  alternates: {
    canonical: 'https://flashflowai.com/signup',
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
