'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, AlertTriangle, Zap } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';

interface LowCreditBannerProps {
  threshold?: number;
  className?: string;
}

export function LowCreditBanner({ threshold = 5, className = '' }: LowCreditBannerProps) {
  const { credits, subscription, isLoading, isFreeUser } = useCredits();
  const [dismissed, setDismissed] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    // Check if user has dismissed this session
    const dismissedKey = `low_credit_dismissed_${new Date().toDateString()}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(dismissedKey)) {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    const dismissedKey = `low_credit_dismissed_${new Date().toDateString()}`;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(dismissedKey, 'true');
    }
  };

  // Don't render anything while loading or if dismissed
  if (!hasMounted || isLoading || dismissed) return null;

  // Don't show for unlimited/admin users
  if (credits?.remaining === -1 || credits?.isUnlimited) return null;

  // Don't show if credits are above threshold
  const remaining = credits?.remaining ?? 0;
  if (remaining > threshold) return null;

  // Different messages based on credit level
  const isOutOfCredits = remaining <= 0;
  const isCritical = remaining > 0 && remaining <= 2;

  return (
    <div
      className={`relative ${
        isOutOfCredits
          ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : isCritical
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
      } border rounded-lg px-4 py-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isOutOfCredits ? (
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <Zap className="w-5 h-5 flex-shrink-0" />
          )}
          <div>
            <span className="font-medium">
              {isOutOfCredits
                ? 'You\'re out of credits!'
                : isCritical
                ? `Only ${remaining} credit${remaining === 1 ? '' : 's'} remaining!`
                : `Running low on credits (${remaining} left)`}
            </span>
            <span className="hidden sm:inline ml-2 text-sm opacity-80">
              {isFreeUser
                ? 'Upgrade to get more credits each month.'
                : 'Purchase more credits or upgrade your plan.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/upgrade"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isOutOfCredits
                ? 'bg-red-500 text-white hover:bg-red-600'
                : isCritical
                ? 'bg-amber-500 text-zinc-900 hover:bg-amber-400'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isFreeUser ? 'Upgrade' : 'Get Credits'}
          </Link>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default LowCreditBanner;
