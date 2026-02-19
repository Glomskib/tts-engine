'use client';

import { useEffect, useState, useRef } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Shows a banner when the user is truly offline (network unreachable).
 * Requires 2 consecutive failures before showing the banner to avoid
 * false positives from slow health checks or transient issues.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const failCountRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastCheckRef = useRef<number>(0);

  const checkConnectivity = async () => {
    try {
      // Use HEAD for minimal overhead; 5s timeout to tolerate slow responses
      await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });

      // Any response (even 503) means network is reachable
      failCountRef.current = 0;
      setIsOffline(false);
    } catch {
      failCountRef.current += 1;
      // Only show offline after 2 consecutive failures
      if (failCountRef.current >= 2) {
        setIsOffline(true);
      }
    }
  };

  const debouncedCheck = () => {
    const now = Date.now();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (now - lastCheckRef.current < 2000) {
      debounceTimerRef.current = setTimeout(checkConnectivity, 2000);
      return;
    }

    lastCheckRef.current = now;
    checkConnectivity();
  };

  useEffect(() => {
    // Initial check on mount
    checkConnectivity();

    const handleOnline = () => debouncedCheck();
    const handleOffline = () => {
      // Browser says offline — verify with a ping before showing banner
      debouncedCheck();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 30 seconds
    const intervalId = setInterval(checkConnectivity, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-600 text-white py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium animate-slide-in-up">
      <WifiOff className="w-4 h-4" />
      <span>You&apos;re offline. Some features may not work.</span>
    </div>
  );
}

export default OfflineIndicator;
