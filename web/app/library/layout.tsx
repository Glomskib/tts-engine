import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Your Library | FlashFlow AI' },
  description: 'All your finished, retake, and draft videos — searchable, downloadable, ready to post.',
  openGraph: { title: 'Your Library | FlashFlow AI', description: 'All your finished, retake, and draft videos — searchable, downloadable, ready to post.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
