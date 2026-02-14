'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';

export default function LPLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      {/* Minimal header — logo + CTA only */}
      <header className="border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="font-semibold text-zinc-100">{BRAND.name}</span>
          </Link>
          <Link
            href="/script-generator"
            className="text-sm px-4 py-2 bg-white text-zinc-900 rounded-lg font-medium hover:bg-zinc-100 transition-colors"
          >
            Try Script Generator Free
          </Link>
        </div>
      </header>

      {/* Content — no footer nav to reduce exit points */}
      <main className="flex-1">{children}</main>

      {/* Minimal footer — just copyright */}
      <footer className="border-t border-white/5 py-6 px-6">
        <p className="text-center text-xs text-zinc-600">
          &copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
