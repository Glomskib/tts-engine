import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Avatars',
  description: 'Persistent AI spokespersons. Same face, same voice, same personality across every video.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
