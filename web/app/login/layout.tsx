import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log In',
  description: 'Sign in to your FlashFlow AI account to generate TikTok Shop scripts, manage concepts, and track performance.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
