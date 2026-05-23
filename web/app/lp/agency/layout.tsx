import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'For Agencies | FlashFlow AI' },
  description: 'Built for content agencies running multiple creators.',
  openGraph: { title: 'For Agencies | FlashFlow AI', description: 'Built for content agencies running multiple creators.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
