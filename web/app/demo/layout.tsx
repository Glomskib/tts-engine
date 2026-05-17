import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Demo',
  description: 'See FlashFlow turn one product idea into 30 days of branded content in under a minute.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
