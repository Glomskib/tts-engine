'use client';

/**
 * BrandedLoader — FlashFlow's shared loading component system.
 *
 * Three variants:
 *   1. FullPage — centered overlay for page-level loading
 *   2. Inline — compact spinner for button/card-level loading
 *   3. Section — mid-size loader for content sections
 *
 * All variants use the FlashFlow logo with a pulse animation
 * for brand consistency.
 */

import Image from 'next/image';

// ── Full Page Loader ─────────────────────────────────────────────────

interface FullPageLoaderProps {
  message?: string;
  submessage?: string;
}

export function FullPageLoader({ message = 'Loading...', submessage }: FullPageLoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center animate-pulse">
          <Image src="/logo.svg" alt="FlashFlow" width={28} height={28} className="opacity-80" />
        </div>
        {/* Shimmer ring */}
        <div className="absolute inset-0 rounded-xl border-2 border-teal-500/20 animate-ping" style={{ animationDuration: '2s' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-300">{message}</p>
        {submessage && <p className="text-xs text-zinc-500 mt-1">{submessage}</p>}
      </div>
    </div>
  );
}

// ── Section Loader ───────────────────────────────────────────────────

interface SectionLoaderProps {
  message?: string;
  className?: string;
}

export function SectionLoader({ message, className = '' }: SectionLoaderProps) {
  return (
    <div className={`flex items-center justify-center gap-3 py-12 ${className}`}>
      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center animate-pulse">
        <Image src="/logo.svg" alt="FlashFlow" width={20} height={20} className="opacity-70" />
      </div>
      {message && <span className="text-sm text-zinc-400">{message}</span>}
    </div>
  );
}

// ── Inline Loader ────────────────────────────────────────────────────

interface InlineLoaderProps {
  message?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function InlineLoader({ message, size = 'sm', className = '' }: InlineLoaderProps) {
  const iconSize = size === 'sm' ? 14 : 18;
  const boxSize = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`${boxSize} rounded-md bg-zinc-800 border border-white/5 flex items-center justify-center animate-pulse`}>
        <Image src="/logo.svg" alt="" width={iconSize} height={iconSize} className="opacity-60" />
      </span>
      {message && <span className={`${textSize} text-zinc-400`}>{message}</span>}
    </span>
  );
}

// ── Card Skeleton with Logo ──────────────────────────────────────────

interface CardLoaderProps {
  count?: number;
  className?: string;
}

export function CardLoader({ count = 3, className = '' }: CardLoaderProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-zinc-900/50 border border-white/10 rounded-xl p-5 animate-pulse"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-zinc-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-zinc-800 rounded w-3/4" />
              <div className="h-2.5 bg-zinc-800 rounded w-1/2" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-2.5 bg-zinc-800 rounded" />
            <div className="h-2.5 bg-zinc-800 rounded w-5/6" />
            <div className="h-2.5 bg-zinc-800 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Table Skeleton ───────────────────────────────────────────────────

interface TableLoaderProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableLoader({ rows = 5, columns = 4, className = '' }: TableLoaderProps) {
  return (
    <div className={`bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex gap-4 px-5 py-3 border-b border-white/5">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1 h-3 bg-zinc-800 rounded animate-pulse" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-5 py-3 border-b border-white/5 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="flex-1 h-2.5 bg-zinc-800 rounded animate-pulse"
              style={{ animationDelay: `${(r * columns + c) * 50}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Stats Skeleton ───────────────────────────────────────────────────

interface StatsLoaderProps {
  count?: number;
  className?: string;
}

export function StatsLoader({ count = 4, className = '' }: StatsLoaderProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 animate-pulse"
        >
          <div className="h-2.5 bg-zinc-800 rounded w-1/2 mb-3" />
          <div className="h-6 bg-zinc-800 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}
