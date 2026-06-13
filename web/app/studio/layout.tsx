import type { Metadata, Viewport } from 'next';

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
  // SWRegister moved to the root layout (2026-06-12) so the service worker —
  // and therefore Android installability — covers the whole app, not just
  // /studio. Mounting it here too would double-register the same scope.
  return <>{children}</>;
}
