import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Upload',
  description: 'Drop in raw footage. We turn it into ready-to-post clips with hooks, captions, and B-roll.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
