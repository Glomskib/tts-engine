import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'FlashFlow Remix: Turn This Viral Video Into Your Version',
  description:
    'See how FlashFlow breaks down a viral video and generates a creator-ready remix with new hooks, scripts, and visual ideas.',
  openGraph: {
    title: 'FlashFlow Remix: Turn This Viral Video Into Your Version',
    description:
      'A viral video broken down and remixed into a creator-ready script with hooks and visual ideas.',
    type: 'website',
  },
};

export default function RemixResultLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
