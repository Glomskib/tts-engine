import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Script Generator — FlashFlow',
  description: 'Generate scroll-stopping TikTok scripts from any product idea in seconds.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
