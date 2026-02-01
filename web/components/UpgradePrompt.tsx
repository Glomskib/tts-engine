'use client';

import Link from 'next/link';
import { Zap, X } from 'lucide-react';
import { useState } from 'react';

interface UpgradePromptProps {
  title?: string;
  description?: string;
  cta?: string;
  variant?: 'banner' | 'card' | 'inline';
  dismissible?: boolean;
  storageKey?: string;
}

export function UpgradePrompt({
  title = 'Upgrade to Pro',
  description = 'Get more credits and unlock advanced features',
  cta = 'Upgrade Now',
  variant = 'card',
  dismissible = true,
  storageKey,
}: UpgradePromptProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      return localStorage.getItem(`upgrade-dismissed-${storageKey}`) === 'true';
    }
    return false;
  });

  const handleDismiss = () => {
    setDismissed(true);
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(`upgrade-dismissed-${storageKey}`, 'true');
    }
  };

  if (dismissed) return null;

  if (variant === 'banner') {
    return (
      <div className="relative bg-gradient-to-r from-blue-600/20 via-violet-600/20 to-blue-600/20 border-y border-blue-500/20 py-3 px-4">
        <div className="flex items-center justify-center gap-4 text-sm">
          <Zap size={16} className="text-blue-400" />
          <span className="text-zinc-200">{title}</span>
          <Link
            href="/upgrade"
            className="px-3 py-1 rounded-full bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
          >
            {cta}
          </Link>
          {dismissible && (
            <button
              onClick={handleDismiss}
              className="absolute right-4 text-zinc-500 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
        <Zap size={14} className="text-blue-400" />
        <span className="text-xs text-zinc-300">{title}</span>
        <Link
          href="/upgrade"
          className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
        >
          {cta} →
        </Link>
      </div>
    );
  }

  // Default: card variant
  return (
    <div className="relative p-6 rounded-xl bg-gradient-to-br from-blue-600/10 via-violet-600/10 to-blue-600/10 border border-blue-500/20">
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      )}

      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
          <Zap size={20} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-white mb-1">{title}</h4>
          <p className="text-sm text-zinc-400 mb-4">{description}</p>
          <Link
            href="/upgrade"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            {cta}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Low credits warning variant
export function LowCreditsPrompt({ credits }: { credits: number }) {
  if (credits > 5) return null;

  return (
    <UpgradePrompt
      title={credits === 0 ? 'Out of credits!' : `Only ${credits} credit${credits === 1 ? '' : 's'} remaining`}
      description="Upgrade to Pro for 500 monthly credits and never run out"
      cta="Get More Credits"
      storageKey={`low-credits-${credits}`}
    />
  );
}
