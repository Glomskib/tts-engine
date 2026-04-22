'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { BRAND } from '@/lib/navigation';
import { Sparkles, BookmarkCheck, User, Settings2 } from 'lucide-react';

const NAV = [
  { href: '/create', label: 'Create', icon: Sparkles },
  { href: '/library', label: 'Library', icon: BookmarkCheck },
  { href: '/account', label: 'Account', icon: User },
];

export default function V1Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, authenticated, isAdmin } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!authenticated) router.replace('/login?redirect=' + encodeURIComponent(pathname || '/create'));
  }, [loading, authenticated, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-zinc-500">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#09090b]/90 backdrop-blur">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 md:px-6 h-14">
          <Link href="/create" className="flex items-center gap-2.5 no-underline text-zinc-100">
            <Image src={BRAND.logo} alt={BRAND.name} width={28} height={28} className="rounded-md" />
            <span className="font-semibold text-[15px] tracking-tight">{BRAND.name}</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors no-underline
                    ${active ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'}
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin/today"
                className="ml-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/5 no-underline"
                title="Open the full admin / advanced surface"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Advanced</span>
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">{children}</main>
    </div>
  );
}
