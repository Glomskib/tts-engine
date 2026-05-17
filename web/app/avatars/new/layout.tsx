import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: { absolute: 'New avatar | FlashFlow AI' },
  description: 'Pick a starting point and bring an AI spokesperson to life in minutes.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
