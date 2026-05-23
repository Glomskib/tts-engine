import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Free Tools | FlashFlow AI' },
  description: 'TikTok transcriber, YouTube transcriber, script generator, trend radar.',
  openGraph: { title: 'Free Tools | FlashFlow AI', description: 'TikTok transcriber, YouTube transcriber, script generator, trend radar.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
