'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { CreditsBadge } from '@/components/CreditsBadge';
import { NavIcon } from '@/components/icons/NavIcons';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface AppHeaderProps {
  userEmail: string | null;
  planName?: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function AppHeader({
  userEmail,
  planName = 'Free',
  sidebarOpen,
  onToggleSidebar,
}: AppHeaderProps) {
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 h-16 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5">
      {/* Left: Menu toggle + Logo (when sidebar closed) */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? <NavIcon name="Close" /> : <NavIcon name="Menu" />}
        </button>
        {!sidebarOpen && (
          <Link href="/" className="flex items-center gap-2">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="hidden sm:inline font-semibold text-zinc-100">{BRAND.name}</span>
          </Link>
        )}
      </div>

      {/* Right: Credits + User menu */}
      <div className="flex items-center gap-4">
        <CreditsBadge />

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-medium">
              {userEmail?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="hidden md:inline text-sm max-w-[150px] truncate">
              {userEmail || 'User'}
            </span>
            <NavIcon name="ChevronDown" />
          </button>

          {/* Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-white/10 rounded-xl shadow-xl py-2 z-50">
              <div className="px-4 py-2 border-b border-white/10">
                <div className="text-sm font-medium text-zinc-100 truncate">{userEmail}</div>
                <div className="text-xs text-zinc-500">{planName} Plan</div>
              </div>

              <div className="py-1">
                <Link
                  href="/admin/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <NavIcon name="User" />
                  Account Settings
                </Link>
                <Link
                  href="/upgrade"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <NavIcon name="Zap" />
                  Upgrade Plan
                </Link>
              </div>

              <div className="border-t border-white/10 pt-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
                >
                  <NavIcon name="LogOut" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
