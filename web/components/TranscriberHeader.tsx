'use client';

import Link from 'next/link';
import { Smartphone, Play, Globe } from 'lucide-react';

/**
 * Shared header for the three transcriber pages. Renders a 3-tab pill row
 * above <TranscriberCore /> so visitors can clearly see which page they're
 * on and switch between TikTok/Reels, YouTube, and the universal "any URL"
 * version without guessing. Built in response to user feedback that the
 * three pages were indistinguishable.
 */
export interface TranscriberHeaderProps {
  active: 'short' | 'youtube' | 'any';
}

interface Tab {
  key: TranscriberHeaderProps['active'];
  label: string;
  sub: string;
  href: string;
  Icon: typeof Smartphone;
}

const TABS: Tab[] = [
  {
    key: 'short',
    label: 'Short videos',
    sub: 'TikTok / Reels',
    href: '/transcribe',
    Icon: Smartphone,
  },
  {
    key: 'youtube',
    label: 'YouTube videos',
    sub: 'Long-form & Shorts',
    href: '/youtube-transcribe',
    Icon: Play,
  },
  {
    key: 'any',
    label: 'Any URL',
    sub: 'We auto-detect',
    href: '/transcribe-anything',
    Icon: Globe,
  },
];

export default function TranscriberHeader({ active }: TranscriberHeaderProps) {
  return (
    <div className="w-full bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-2">
        <p className="text-sm text-zinc-400 text-center mb-3">
          Pick the one that matches the video you have.
        </p>

        {/* 3-tab pill row. Horizontal scroll on small screens so tabs never
            wrap awkwardly; gap-2 keeps them readable side-by-side on >=sm. */}
        <nav
          aria-label="Transcriber type"
          className="flex gap-2 overflow-x-auto sm:overflow-visible sm:justify-center pb-1 -mx-1 px-1"
        >
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            const base =
              'group flex items-center gap-2 shrink-0 px-4 py-2.5 rounded-full border text-sm font-medium transition-all whitespace-nowrap';
            const styles = isActive
              ? 'bg-teal-500 border-teal-400 text-zinc-950 shadow-sm shadow-teal-500/30'
              : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-teal-500/40 hover:text-white hover:bg-zinc-900';
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`${base} ${styles}`}
              >
                <tab.Icon
                  size={16}
                  className={isActive ? 'text-zinc-950' : 'text-teal-400'}
                />
                <span>{tab.label}</span>
                <span
                  className={`hidden sm:inline text-xs ${
                    isActive ? 'text-zinc-800' : 'text-zinc-500'
                  }`}
                >
                  · {tab.sub}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
