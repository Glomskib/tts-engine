'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ThemeProvider } from '@/app/components/ThemeProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { OfflineIndicator } from './ui/OfflineIndicator';
import { PostHogProvider } from './PostHogProvider';

interface ProvidersProps {
  children: ReactNode;
}

// PostHogProvider now handles its own Suspense internally and renders the
// useSearchParams hook in a SIBLING of children (not a parent), so the page
// tree no longer bails out to client-side rendering. See PostHogProvider.tsx.
export function Providers({ children }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <OfflineIndicator />
            <PostHogProvider>{children}</PostHogProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
