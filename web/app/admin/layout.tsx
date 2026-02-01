'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, ChevronDown, User, LogOut, Zap } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';
import { BRAND, getFilteredNavSections, isNavItemActive } from '@/lib/navigation';
import { CreditsBadge } from '@/components/CreditsBadge';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  role: UserRole;
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { subscription } = useCredits();
  const [auth, setAuth] = useState<AuthState>({
    loading: true,
    authenticated: false,
    role: null,
    userId: null,
    userEmail: null,
    isAdmin: false,
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  // Auth check
  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.user) {
            setAuth({
              loading: false,
              authenticated: true,
              role: data.role || null,
              userId: data.user.id,
              userEmail: data.user.email || null,
              isAdmin: data.isAdmin || false,
            });
          } else {
            setAuth({ loading: false, authenticated: false, role: null, userId: null, userEmail: null, isAdmin: false });
            router.replace('/login');
          }
        } else {
          setAuth({ loading: false, authenticated: false, role: null, userId: null, userEmail: null, isAdmin: false });
          router.replace('/login');
        }
      } catch {
        setAuth({ loading: false, authenticated: false, role: null, userId: null, userEmail: null, isAdmin: false });
      }
    };
    fetchAuth();
  }, [pathname, router]);

  // Fetch notifications
  useEffect(() => {
    if (!auth.authenticated) return;
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications?unread_only=true&limit=1');
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.meta?.unread_count || 0);
        }
      } catch {
        // ignore
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [auth.authenticated]);

  const handleLogout = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push('/');
    } catch {
      // ignore
    }
  };

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-500">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return <>{children}</>;
  }

  const navSections = getFilteredNavSections({ planId: subscription?.planId, isAdmin: auth.isAdmin });

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* ============================================================
          MOBILE HEADER - Only visible on mobile (< lg)
          ============================================================ */}
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-white/10 lg:hidden">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left: Menu + Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link href="/admin" className="flex items-center gap-2">
              <Image src={BRAND.logo} alt={BRAND.name} width={28} height={28} className="rounded-lg" />
              <span className="font-semibold text-white text-sm">{BRAND.name}</span>
            </Link>
          </div>

          {/* Right: Credits + User */}
          <div className="flex items-center gap-2">
            <CreditsBadge compact />
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-medium"
            >
              {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================
          MOBILE SIDEBAR OVERLAY - Only visible when open on mobile
          ============================================================ */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />

          {/* Sidebar panel */}
          <aside className="absolute inset-y-0 left-0 w-72 bg-zinc-950 border-r border-white/10 shadow-2xl flex flex-col">
            {/* Header with close button */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <Link href="/admin" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
                <Image src={BRAND.logo} alt={BRAND.name} width={28} height={28} className="rounded-lg" />
                <span className="font-semibold text-white">{BRAND.name}</span>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4">
              {navSections.map((section, idx) => (
                <div key={idx} className="mb-6">
                  <div className="px-4 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    {section.title}
                  </div>
                  {section.items.map((item) => {
                    const active = isNavItemActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors ${
                          active
                            ? 'bg-teal-500/20 text-teal-400'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.href === '/admin/notifications' && unreadCount > 0 && (
                          <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
                            {unreadCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* User info at bottom */}
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-medium">
                  {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{auth.userEmail}</div>
                  <div className="text-xs text-zinc-500">{subscription?.planName || 'Free'} Plan</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ============================================================
          DESKTOP SIDEBAR - Hidden on mobile, fixed on desktop
          ============================================================ */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72 lg:flex-col bg-zinc-950 border-r border-white/10">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <Image src={BRAND.logo} alt={BRAND.name} width={32} height={32} className="rounded-lg" />
          <span className="font-semibold text-white">{BRAND.name}</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {navSections.map((section, idx) => (
            <div key={idx} className="mb-6">
              <div className="px-4 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                {section.title}
              </div>
              {section.items.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors ${
                      active
                        ? 'bg-teal-500/20 text-teal-400'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-medium">{item.name}</span>
                    {item.href === '/admin/notifications' && unreadCount > 0 && (
                      <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ============================================================
          DESKTOP HEADER - Only visible on desktop
          ============================================================ */}
      <header className="hidden lg:flex lg:ml-72 sticky top-0 z-30 bg-zinc-950/95 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-end w-full px-6 h-16">
          <div className="flex items-center gap-4">
            <CreditsBadge />

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-medium">
                  {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="text-sm max-w-[150px] truncate">{auth.userEmail || 'User'}</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-white/10 rounded-xl shadow-xl py-2 z-50">
                    <div className="px-4 py-2 border-b border-white/10">
                      <div className="text-sm font-medium text-zinc-100 truncate">{auth.userEmail}</div>
                      <div className="text-xs text-zinc-500">{subscription?.planName || 'Free'} Plan</div>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/admin/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Account Settings
                      </Link>
                      <Link
                        href="/upgrade"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Zap className="w-4 h-4" />
                        Upgrade Plan
                      </Link>
                    </div>
                    <div className="border-t border-white/10 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================
          MAIN CONTENT - Full width on mobile, offset on desktop
          ============================================================ */}
      <main className="lg:ml-72 min-h-screen">
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>

      {/* Mobile user menu modal */}
      {userMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setUserMenuOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-2xl p-4 pb-8 safe-bottom">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-lg font-medium">
                {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <div className="text-base font-medium text-white">{auth.userEmail}</div>
                <div className="text-sm text-zinc-500">{subscription?.planName || 'Free'} Plan</div>
              </div>
            </div>
            <div className="space-y-1">
              <Link
                href="/admin/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-base text-zinc-300 hover:bg-white/5 rounded-xl transition-colors"
              >
                <User className="w-5 h-5" />
                Account Settings
              </Link>
              <Link
                href="/upgrade"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-base text-zinc-300 hover:bg-white/5 rounded-xl transition-colors"
              >
                <Zap className="w-5 h-5" />
                Upgrade Plan
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 text-base text-red-400 hover:bg-white/5 rounded-xl transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
