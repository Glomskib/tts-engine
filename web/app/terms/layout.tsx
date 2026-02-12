import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'FlashFlow AI terms of service. Read our terms and conditions for using the platform.',
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
