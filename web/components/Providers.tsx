'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ThemeProvider } from '@/app/components/ThemeProvider';
import PWAProvider, { InstallBanner } from './PWAProvider';
import { OfflineIndicator } from './ui/OfflineIndicator';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <PWAProvider>
          <OfflineIndicator />
          {children}
          <InstallBanner />
        </PWAProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
