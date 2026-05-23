import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'For TikTok Shop | FlashFlow AI' },
  description: 'Affiliate-grade scripts and renders for TikTok Shop.',
  openGraph: { title: 'For TikTok Shop | FlashFlow AI', description: 'Affiliate-grade scripts and renders for TikTok Shop.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
