import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Developers | FlashFlow AI' },
  description: 'API access to the FlashFlow video engine.',
  openGraph: { title: 'Developers | FlashFlow AI', description: 'API access to the FlashFlow video engine.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
