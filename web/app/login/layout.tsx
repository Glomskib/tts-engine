import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log In',
  description: 'Sign in to your FlashFlow AI account to generate TikTok Shop scripts, manage concepts, and track performance.',
  openGraph: {
    title: 'Log In | FlashFlow AI',
    description: 'Sign in to generate TikTok scripts, manage content, and track performance.',
    images: [{ url: '/FFAI.png', width: 512, height: 512, alt: 'FlashFlow AI Logo' }],
  },
  alternates: {
    canonical: 'https://flashflowai.com/login',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
