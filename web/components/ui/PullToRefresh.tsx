'use client';

import { Loader2 } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className = '' }: PullToRefreshProps) {
  const { containerRef, pullDistance, isRefreshing, handlers } = usePullToRefresh({
    onRefresh,
    threshold: 80,
  });

  return (
    <div
      ref={containerRef}
      className={className || undefined}
      {...handlers}
    >
      {/* Pull indicator */}
      <div
        className="flex justify-center overflow-hidden transition-all"
        style={{ height: pullDistance }}
      >
        <div className="flex items-center justify-center py-2">
          {isRefreshing ? (
            <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
          ) : (
            <div
              className="w-6 h-6 rounded-full border-2 border-teal-400 border-t-transparent transition-transform"
              style={{
                transform: `rotate(${pullDistance * 3}deg)`,
                opacity: pullDistance / 80,
              }}
            />
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
