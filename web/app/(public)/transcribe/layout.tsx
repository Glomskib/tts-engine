import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Free TikTok Video Transcriber | FlashFlow AI',
  description:
    'Instantly transcribe any TikTok video. Get the full transcript, hook analysis, and content breakdown. Free, no signup required.',
  openGraph: {
    title: 'Free TikTok Video Transcriber | FlashFlow AI',
    description:
      'Instantly transcribe any TikTok video. Get the full transcript, hook analysis, and content breakdown. Free, no signup required.',
    type: 'website',
    images: [{ url: '/FFAI.png', width: 512, height: 512, alt: 'FlashFlow AI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free TikTok Video Transcriber | FlashFlow AI',
    description:
      'Instantly transcribe any TikTok video. Get the full transcript, hook analysis, and content breakdown.',
    images: ['/FFAI.png'],
  },
};

export default function TranscribeLayout({ children }: { children: ReactNode }) {
  return children;
}
