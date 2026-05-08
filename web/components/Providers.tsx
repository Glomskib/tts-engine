'use client';

import { ReactNode, Suspense } from 'react';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ThemeProvider } from '@/app/components/ThemeProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { OfflineIndicator } from './ui/OfflineIndicator';
import { PostHogProvider } from './PostHogProvider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <OfflineIndicator />
            {/* PostHogProvider uses useSearchParams — must be inside Suspense
                so static prerender doesn't bail with the Next.js search-params
                opt-in bailout. Falls through transparently when no key is set. */}
            <Suspense fallback={null}>
              <PostHogProvider>{children}</PostHogProvider>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
