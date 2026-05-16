import type { Metadata, Viewport } from 'next';
import SWRegister from '@/components/pwa/SWRegister';

export const metadata: Metadata = {
  title: 'FlashFlow Studio',
  description: 'Record, polish, and post short-form clips. Phone-first.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#09090b',
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SWRegister />
      {children}
    </>
  );
}
