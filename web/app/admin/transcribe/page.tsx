'use client';

import Link from 'next/link';
import { Youtube, Sparkles, Package } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';
import TranscriberWorkspace from '@/components/TranscriberWorkspace';

export default function AdminTranscribePage() {
  const { subscription } = useCredits();

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="max-w-5xl mx-auto px-4 pt-4 flex items-center gap-4 text-sm">
        <Link
          href="/admin/youtube-transcribe"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Youtube size={14} />
          YouTube Video
        </Link>
        <span className="text-zinc-700">|</span>
        <Link
          href="/admin/content-studio"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Sparkles size={14} />
          Content Studio
        </Link>
        <span className="text-zinc-700">|</span>
        <Link
          href="/admin/content-pack"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Package size={14} />
          Content Pack
        </Link>
      </div>
      <TranscriberWorkspace isPortal={true} isLoggedIn={true} planId={subscription?.planId} />
    </div>
  );
}
