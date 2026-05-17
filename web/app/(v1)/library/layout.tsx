import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Library',
  description: 'Every clip you have made. Download, share, or send straight to a TikTok Shop draft.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
