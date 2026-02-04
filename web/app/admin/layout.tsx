'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { X, ChevronDown, User, LogOut, Zap, Bell } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';
import { getFilteredNavSections, isNavItemActive, BRAND } from '@/lib/navigation';
import { CreditsBadge } from '@/components/CreditsBadge';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ToastProvider } from '@/contexts/ToastContext';
import { OfflineIndicator } from '@/components/ui/OfflineIndicator';
import { MobileTestChecklist } from '@/components/dev/MobileTestChecklist';
import { InstallBanner } from '@/components/PWAProvider';
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal';
import { LowCreditBanner } from '@/components/LowCreditBanner';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface AuthState {
  loading: boolean;
  authenticated: boolean;
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
    userId: null,
    userEmail: null,
    isAdmin: false,
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true); // Default to mobile to prevent flash
  const [unreadCount, setUnreadCount] = useState(0);

  // Detect screen size with JavaScript
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    // Check immediately
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen, isMobile]);

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
              userId: data.user.id,
              userEmail: data.user.email || null,
              isAdmin: data.isAdmin || false,
            });
          } else {
            setAuth({ loading: false, authenticated: false, userId: null, userEmail: null, isAdmin: false });
            router.replace('/login');
          }
        } else {
          setAuth({ loading: false, authenticated: false, userId: null, userEmail: null, isAdmin: false });
          router.replace('/login');
        }
      } catch {
        setAuth({ loading: false, authenticated: false, userId: null, userEmail: null, isAdmin: false });
      }
    };
    fetchAuth();
  }, [router]);

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

  // Loading state
  if (auth.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        <div className="flex items-center gap-3 text-lg">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return <>{children}</>;
  }

  const navSections = getFilteredNavSections({ planId: subscription?.planId, isAdmin: auth.isAdmin });

  // Sidebar content (shared between mobile and desktop)
  const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <nav className="flex-1 overflow-y-auto py-4">
      {navSections.map((section, idx) => (
        <div key={idx} className="mb-8">
          {/* Section headers - bigger on mobile */}
          <h3 className={`px-4 mb-3 font-semibold text-zinc-500 uppercase tracking-wider ${isMobile ? 'text-sm' : 'text-xs'}`}>
            {section.title}
          </h3>
          <div className="space-y-2">
            {section.items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onItemClick}
                  className={`
                    flex items-center gap-4 mx-2 rounded-xl transition-colors
                    ${isMobile
                      ? 'px-4 py-4 text-[17px] min-h-[52px]'  /* 52px touch target, 17px text */
                      : 'px-3 py-2.5 text-sm'}
                    ${active
                      ? 'bg-teal-500/20 text-teal-400'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }
                  `}
                >
                  <Icon className={`flex-shrink-0 ${isMobile ? 'w-7 h-7' : 'w-5 h-5'}`} />
                  <span className="font-medium">{item.name}</span>
                  {item.href === '/admin/notifications' && unreadCount > 0 && (
                    <span className={`ml-auto px-2 py-0.5 font-medium bg-red-500 text-white rounded-full ${isMobile ? 'text-sm' : 'text-xs'}`}>
                      {unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* Notifications link */}
      <div className="px-2 mt-4 pt-4 border-t border-zinc-800">
        <Link
          href="/admin/notifications"
          onClick={onItemClick}
          className={`
            flex items-center gap-4 px-4 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors
            ${isMobile ? 'py-4 text-[17px] min-h-[52px]' : 'py-2.5 text-sm'}
          `}
        >
          <Bell className={`flex-shrink-0 ${isMobile ? 'w-7 h-7' : 'w-5 h-5'}`} />
          <span className="font-medium">Notifications</span>
          {unreadCount > 0 && (
            <span className={`ml-auto px-2 py-0.5 font-medium bg-red-500 text-white rounded-full ${isMobile ? 'text-sm' : 'text-xs'}`}>
              {unreadCount}
            </span>
          )}
        </Link>
      </div>
    </nav>
  );

  return (
    <ToastProvider>
    <OfflineIndicator />
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ============================================================
          MOBILE LAYOUT - Only rendered when isMobile is true
          ============================================================ */}
      {isMobile && (
        <>
          {/* Mobile Header - Simplified with proper overflow handling */}
          <header className="
            fixed top-0 left-0 right-0 h-14 z-40
            bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800
            flex items-center justify-between px-3 gap-2 overflow-hidden
          ">
            <Link href="/admin" className="flex items-center gap-2 flex-shrink-0 min-w-0">
              <Image src={BRAND.logo} alt={BRAND.name} width={32} height={32} className="rounded-lg flex-shrink-0" />
              <span className="font-semibold text-base truncate">{BRAND.name}</span>
            </Link>

            {/* Right side: Credits + User avatar */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <CreditsBadge compact />
              {/* User avatar - tap to open menu */}
              <button type="button"
                onClick={() => setUserMenuOpen(true)}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
              >
                {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
              </button>
            </div>
          </header>

          {/* Mobile Sidebar Overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-50">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/80"
                onClick={() => setSidebarOpen(false)}
              />

              {/* Sidebar Panel - Wider on mobile for easier reading */}
              <aside className="absolute inset-y-0 left-0 w-[320px] max-w-[90vw] bg-zinc-950 border-r border-zinc-800 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <Image src={BRAND.logo} alt={BRAND.name} width={40} height={40} className="rounded-lg" />
                    <span className="font-bold text-2xl">{BRAND.name}</span>
                  </div>
                  <button type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl min-w-[48px] min-h-[48px] flex items-center justify-center"
                    aria-label="Close sidebar"
                  >
                    <X className="w-7 h-7" />
                  </button>
                </div>

                {/* Navigation */}
                <SidebarContent onItemClick={() => setSidebarOpen(false)} />

                {/* User info - Larger for mobile */}
                <div className="p-5 border-t border-zinc-800">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-2xl">
                      {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] font-medium text-white truncate">{auth.userEmail}</p>
                      <p className="text-base text-zinc-500">{subscription?.planName || 'Free'} Plan</p>
                    </div>
                  </div>
                  <button type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-4 w-full px-4 py-4 text-[17px] text-red-400 hover:bg-zinc-800 rounded-xl transition-colors min-h-[52px]"
                  >
                    <LogOut className="w-7 h-7" />
                    Logout
                  </button>
                </div>
              </aside>
            </div>
          )}

          {/* Mobile User Menu - Larger touch targets */}
          {userMenuOpen && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/80" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl p-6 pb-12 safe-bottom">
                <div className="w-14 h-1.5 bg-zinc-700 rounded-full mx-auto mb-6" />

                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-zinc-800">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
                    {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-medium text-white truncate">{auth.userEmail}</p>
                    <p className="text-[17px] text-zinc-500">{subscription?.planName || 'Free'} Plan</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Link
                    href="/admin/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-4 px-5 py-5 text-[17px] text-zinc-300 hover:bg-zinc-800 rounded-xl transition-colors min-h-[56px]"
                  >
                    <User className="w-7 h-7" />
                    Account Settings
                  </Link>
                  <Link
                    href="/upgrade"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-4 px-5 py-5 text-[17px] text-zinc-300 hover:bg-zinc-800 rounded-xl transition-colors min-h-[56px]"
                  >
                    <Zap className="w-7 h-7" />
                    Upgrade Plan
                  </Link>
                  <button type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-4 w-full px-5 py-5 text-[17px] text-red-400 hover:bg-zinc-800 rounded-xl transition-colors min-h-[56px]"
                  >
                    <LogOut className="w-7 h-7" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Main Content - FULL WIDTH with padding for header and bottom nav */}
          <main className="pt-16 pb-24 min-h-screen overflow-x-hidden">
            <div className="px-4 max-w-full overflow-hidden">
              <LowCreditBanner className="mb-4" />
              {children}
            </div>
          </main>

          {/* Mobile Bottom Navigation */}
          <MobileBottomNav
            onMoreClick={() => setSidebarOpen(true)}
            unreadCount={unreadCount}
          />

          {/* Development Test Checklist */}
          <MobileTestChecklist />

          {/* PWA Install Banner */}
          <InstallBanner />
        </>
      )}

      {/* ============================================================
          DESKTOP LAYOUT - Only rendered when isMobile is false
          ============================================================ */}
      {!isMobile && (
        <>
          {/* Desktop Sidebar - Fixed */}
          <aside className="fixed inset-y-0 left-0 w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col z-40">
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-zinc-800">
              <Image src={BRAND.logo} alt={BRAND.name} width={36} height={36} className="rounded-lg" />
              <span className="font-bold text-xl">{BRAND.name}</span>
            </div>

            {/* Navigation */}
            <SidebarContent />
          </aside>

          {/* Desktop Header */}
          <header className="fixed top-0 left-72 right-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
            <div className="flex items-center justify-end px-6 h-16">
              <div className="flex items-center gap-4">
                <CreditsBadge />

                {/* User menu */}
                <div className="relative">
                  <button type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
                      {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="text-sm max-w-[150px] truncate">{auth.userEmail}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl py-2 z-50">
                        <div className="px-4 py-2 border-b border-zinc-800">
                          <p className="text-sm font-medium text-white truncate">{auth.userEmail}</p>
                          <p className="text-xs text-zinc-500">{subscription?.planName || 'Free'} Plan</p>
                        </div>
                        <div className="py-1">
                          <Link
                            href="/admin/settings"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                          >
                            <User className="w-4 h-4" />
                            Account Settings
                          </Link>
                          <Link
                            href="/upgrade"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                          >
                            <Zap className="w-4 h-4" />
                            Upgrade Plan
                          </Link>
                        </div>
                        <div className="border-t border-zinc-800 pt-1">
                          <button type="button"
                            onClick={handleLogout}
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-zinc-800 transition-colors"
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

          {/* Desktop Main Content - Offset by sidebar */}
          <main className="ml-72 pt-16 min-h-screen">
            <div className="p-6">
              <LowCreditBanner className="mb-6" />
              {children}
            </div>
          </main>
        </>
      )}

    </div>
    <KeyboardShortcutsModal />
    </ToastProvider>
  );
}
