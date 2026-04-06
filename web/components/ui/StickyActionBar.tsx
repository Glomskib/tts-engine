'use client';

import type { ReactNode } from 'react';

interface StickyActionBarProps {
  children: ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Mobile-first sticky bottom action bar for primary CTAs.
 * Sits above the bottom nav with safe area padding.
 */
export function StickyActionBar({ children, className = '' }: StickyActionBarProps) {
  return (
    <div
      className={`fixed bottom-16 left-0 right-0 z-40 lg:hidden px-4 pb-2 pt-3 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent ${className}`}
    >
      <div className="flex items-center gap-3">
        {children}
      </div>
    </div>
  );
}
