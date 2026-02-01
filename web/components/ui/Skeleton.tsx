interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseClasses = 'bg-zinc-800';

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseClasses} ${animationClasses[animation]} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

// Common skeleton patterns
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          height={16}
          width={i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 rounded-xl border border-white/10 bg-zinc-900/50 ${className}`}>
      <Skeleton height={24} width="40%" className="mb-4" />
      <SkeletonText lines={3} />
      <div className="flex gap-2 mt-4">
        <Skeleton height={32} width={80} />
        <Skeleton height={32} width={80} />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className = '' }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-zinc-900/30 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex gap-4 p-4 border-b border-white/10">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height={12} width={`${100 / cols - 5}%`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className={`flex gap-4 p-4 ${rowIndex !== rows - 1 ? 'border-b border-white/5' : ''}`}
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} height={16} width={`${100 / cols - 5}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <Skeleton variant="circular" width={size} height={size} className={className} />;
}

export function SkeletonButton({ width = 100, className = '' }: { width?: number | string; className?: string }) {
  return <Skeleton height={36} width={width} className={className} />;
}

// Page-level skeleton layouts
export function SkeletonPageHeader({ className = '' }: { className?: string }) {
  return (
    <div className={`mb-8 ${className}`}>
      <Skeleton height={32} width="30%" className="mb-2" />
      <Skeleton height={16} width="50%" />
    </div>
  );
}

export function SkeletonStats({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-5 rounded-xl border border-white/10 bg-zinc-900/50">
          <Skeleton height={14} width="50%" className="mb-2" />
          <Skeleton height={28} width="40%" />
        </div>
      ))}
    </div>
  );
}

// Video card skeleton for pipeline/queue views
export function SkeletonVideoCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 rounded-xl border border-white/10 bg-zinc-900/50 ${className}`}>
      {/* Status badge */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton height={24} width={80} className="rounded" />
        <Skeleton height={20} width={60} />
      </div>
      {/* Title/Code */}
      <Skeleton height={18} width="70%" className="mb-2" />
      {/* Metadata */}
      <Skeleton height={14} width="50%" className="mb-3" />
      {/* Action buttons */}
      <div className="flex gap-2 pt-3 border-t border-white/5">
        <Skeleton height={40} width="48%" className="rounded-lg" />
        <Skeleton height={40} width="48%" className="rounded-lg" />
      </div>
    </div>
  );
}

// List of video cards skeleton
export function SkeletonVideoList({ count = 5, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonVideoCard key={i} />
      ))}
    </div>
  );
}

// Notification card skeleton
export function SkeletonNotification({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Skeleton height={24} width={80} className="rounded" />
        <Skeleton height={16} width="60%" className="flex-1" />
        <Skeleton height={12} width={60} />
      </div>
    </div>
  );
}

// Winner card skeleton
export function SkeletonWinnerCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 rounded-xl border border-white/10 bg-zinc-900/50 ${className}`}>
      {/* Status + Quality */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton height={24} width={70} className="rounded" />
        <Skeleton height={18} width={60} />
      </div>
      {/* Creator handle */}
      <Skeleton height={14} width="30%" className="mb-2" />
      {/* Hook preview */}
      <Skeleton height={16} width="90%" className="mb-1" />
      <Skeleton height={16} width="70%" className="mb-3" />
      {/* Category + Date */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton height={12} width={80} />
        <Skeleton height={12} width={60} />
      </div>
      {/* Actions */}
      <div className="flex gap-2 pt-3 border-t border-white/5">
        <Skeleton height={44} width="48%" className="rounded-lg" />
        <Skeleton height={44} width="48%" className="rounded-lg" />
      </div>
    </div>
  );
}
