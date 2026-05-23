import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Examples | FlashFlow AI' },
  description: 'Real outputs across vibes, lengths, and platforms.',
  openGraph: { title: 'Examples | FlashFlow AI', description: 'Real outputs across vibes, lengths, and platforms.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
