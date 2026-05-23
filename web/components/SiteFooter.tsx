'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';

/**
 * SiteFooter — global footer mounted in root layout.
 *
 * Suppressed on fullscreen capture (/studio) and auth-modal screens where a
 * footer would just be noise.
 */

const HIDDEN_PREFIXES = ['/studio', '/auth', '/onboarding/quickstart', '/cooking'];

export function SiteFooter() {
  const pathname = usePathname() || '/';
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <footer className="mt-16 border-t border-white/10 bg-zinc-950/80">
      <div className="max-w-6xl mx-auto px-5 py-10 grid grid-cols-2 md:grid-cols-5 gap-6 text-sm">
        <div className="col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <span className="font-bold text-white">FlashFlow AI</span>
          </div>
          <p className="text-zinc-400 text-xs leading-relaxed max-w-xs">
            The fastest way to turn raw footage into platform-ready short videos.
          </p>
        </div>

        <div>
          <div className="text-zinc-500 uppercase tracking-wider text-[10px] mb-2">Make</div>
          <ul className="space-y-1.5 text-zinc-300">
            <li><Link href="/create" className="hover:text-teal-300">AI Video Editor</Link></li>
            <li><Link href="/studio" className="hover:text-teal-300">Studio (record)</Link></li>
            <li><Link href="/avatars" className="hover:text-teal-300">Avatars</Link></li>
            <li><Link href="/library" className="hover:text-teal-300">Library</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-zinc-500 uppercase tracking-wider text-[10px] mb-2">Free tools</div>
          <ul className="space-y-1.5 text-zinc-300">
            <li><Link href="/transcribe" className="hover:text-teal-300">TikTok Transcriber</Link></li>
            <li><Link href="/youtube-transcribe" className="hover:text-teal-300">YouTube Transcriber</Link></li>
            <li><Link href="/script-generator" className="hover:text-teal-300">Script Generator</Link></li>
            <li><Link href="/trend-radar" className="hover:text-teal-300">Trend Radar</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-zinc-500 uppercase tracking-wider text-[10px] mb-2">Company</div>
          <ul className="space-y-1.5 text-zinc-300">
            <li><Link href="/pricing" className="hover:text-teal-300">Pricing</Link></li>
            <li><Link href="/changelog" className="hover:text-teal-300">Changelog</Link></li>
            <li><Link href="/developers" className="hover:text-teal-300">Developers</Link></li>
            <li><Link href="/affiliate" className="hover:text-teal-300">Affiliate</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-[11px] text-zinc-500">
          <div>© {new Date().getFullYear()} FlashFlow AI. All rights reserved.</div>
          <div className="flex items-center gap-3">
            <Link href="/privacy" className="hover:text-zinc-300">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300">Terms</Link>
            <Link href="/refund" className="hover:text-zinc-300">Refund</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}