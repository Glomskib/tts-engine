import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Changelog | FlashFlow AI' },
  description: 'What we shipped recently in FlashFlow AI.',
  openGraph: { title: 'Changelog | FlashFlow AI', description: 'What we shipped recently in FlashFlow AI.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
