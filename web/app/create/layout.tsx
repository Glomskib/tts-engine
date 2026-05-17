import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Create',
  description: 'Turn one take into a polished, ready-to-post short. Hooks, captions, vibe, all on autopilot.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
