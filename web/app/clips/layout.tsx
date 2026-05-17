import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Clips',
  description: 'Every short you have generated. Filter by status, download, share, post.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
