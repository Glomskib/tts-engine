'use client';

import { useEffect, useState, useRef } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Shows a banner when the user is offline.
 * Uses actual connectivity pings (/api/health) instead of unreliable navigator.onLine.
 * Debounced to avoid excessive checks.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastCheckRef = useRef<number>(0);

  /**
   * Performs an actual connectivity check by pinging the health endpoint.
   * Only sets offline if the ping truly fails (not based on navigator.onLine).
   */
  const checkConnectivity = async () => {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      // If we got any response, we're online
      setIsOffline(false);
    } catch (error) {
      // Only mark offline if the fetch actually failed
      // Don't trust navigator.onLine alone
      if (error instanceof Error) {
        console.warn('[OfflineIndicator] Connectivity check failed:', error.message);
      }
      setIsOffline(true);
    }
  };

  /**
   * Debounced connectivity check to avoid excessive pinging
   */
  const debouncedCheck = () => {
    const now = Date.now();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only check if at least 2 seconds since last check
    if (now - lastCheckRef.current < 2000) {
      debounceTimerRef.current = setTimeout(checkConnectivity, 2000);
      return;
    }

    lastCheckRef.current = now;
    checkConnectivity();
  };

  useEffect(() => {
    // Initial connectivity check on mount
    checkConnectivity();

    // Listen for online/offline events, but verify with actual ping
    const handleOnline = () => {
      console.log('[OfflineIndicator] online event fired, checking connectivity...');
      debouncedCheck();
    };

    const handleOffline = () => {
      console.log('[OfflineIndicator] offline event fired');
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic connectivity checks every 30 seconds to catch issues
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
