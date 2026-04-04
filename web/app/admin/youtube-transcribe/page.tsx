'use client';

import Link from 'next/link';
import { Mic, Sparkles, Package } from 'lucide-react';
import YouTubeTranscriberCore from '@/components/YouTubeTranscriberCore';

export default function AdminYouTubeTranscribePage() {
  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 pt-4 flex items-center gap-4 text-sm">
        <Link
          href="/admin/transcribe"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Mic size={14} />
          TikTok Video
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
      <YouTubeTranscriberCore />
    </div>
  );
}
