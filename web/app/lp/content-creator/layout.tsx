import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'For Creators | FlashFlow AI' },
  description: 'The fastest way to turn raw footage into platform-ready shorts.',
  openGraph: { title: 'For Creators | FlashFlow AI', description: 'The fastest way to turn raw footage into platform-ready shorts.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
