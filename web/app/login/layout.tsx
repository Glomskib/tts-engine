import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log In',
  description: 'Sign in to your FlashFlow AI account to generate TikTok Shop scripts, manage concepts, and track performance.',
  openGraph: {
    title: { absolute: 'Log In | FlashFlow AI' },
    description: 'Sign in to generate TikTok scripts, manage content, and track performance.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
  },
  alternates: {
    canonical: 'https://flashflowai.com/login',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
