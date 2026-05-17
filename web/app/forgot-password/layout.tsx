import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Reset Password — FlashFlow',
  description: 'Forgot your password? Enter your email and we will send you a reset link.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
