import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Remix Any Viral Video — Turn TikToks & Shorts Into Your Own Content | FlashFlow',
  description:
    'Paste a TikTok or YouTube link to break down why it works, then get a creator-ready remix script, hooks, and visual ideas you can film today. Free, no signup.',
  keywords: [
    'remake viral video',
    'recreate TikTok video',
    'turn viral video into script',
    'TikTok video breakdown',
    'TikTok remix tool',
    'recreate YouTube Short',
    'viral video script generator',
    'TikTok hook generator',
  ],
  openGraph: {
    title: 'Remix Any Viral Video — FlashFlow',
    description:
      'Break down any viral TikTok or YouTube Short and generate your own version with a remix script, hooks, and visual ideas.',
    type: 'website',
  },
};

export default function RemixLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
