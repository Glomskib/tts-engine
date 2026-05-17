import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Transcribe Anything — FlashFlow',
  description: 'Paste any video URL. Get the transcript plus an AI breakdown of the hook, beats, and CTA.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
