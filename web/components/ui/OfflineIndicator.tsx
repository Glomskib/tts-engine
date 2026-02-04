'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Shows a banner when the user is offline.
 * Automatically detects online/offline status changes.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    // Check initial state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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
