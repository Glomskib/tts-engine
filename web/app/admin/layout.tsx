'use client';

import { useState, useEffect, ReactNode, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CreditsBadge } from '@/components/CreditsBadge';
import { useCredits } from '@/hooks/useCredits';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BRAND, hasVideoProductionAccess } from '@/lib/brand';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  role: UserRole;
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SIDEBAR_STORAGE_KEY = 'ffai-sidebar-open';
const MOBILE_BREAKPOINT = 768;

// Icons as components
const Icons = {
  Menu: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  Close: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Sparkles: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M5 19l.5 1.5L7 21l-1.5.5L5 23l-.5-1.5L3 21l1.5-.5L5 19z" />
      <path d="M19 13l.5 1.5L21 15l-1.5.5L19 17l-.5-1.5L17 15l1.5-.5L19 13z" />
    </svg>
  ),
  FileText: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Trophy: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Package: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4l-9-5.19" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Video: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23,7 16,12 23,17 23,7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  BarChart: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  Activity: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  CreditCard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  Shield: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Layout: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  Building: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  ),
  Calendar: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Server: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  User: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  LogOut: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6,9 12,15 18,9" />
    </svg>
  ),
  Bell: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Zap: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />
    </svg>
  ),
};

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
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

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        setSidebarOpen(stored !== 'false');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Save sidebar preference
  useEffect(() => {
    if (!isMobile) {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
    }
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
      } catch (err) {
        console.error('Auth check failed:', err);
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
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
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
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  const isActive = (href: string) => {
    if (href === '/admin/skit-generator') {
      return pathname === '/admin/skit-generator';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Build navigation based on user type
  const isAgencyUser = hasVideoProductionAccess(subscription?.planId, auth.isAdmin);

  const getNavSections = (): NavSection[] => {
    const sections: NavSection[] = [];

    // Content Creation - always visible
    sections.push({
      title: 'Content Creation',
      items: [
        { label: 'Script Generator', href: '/admin/skit-generator', icon: <Icons.Sparkles /> },
        { label: 'Script Library', href: '/admin/skit-library', icon: <Icons.FileText /> },
        { label: 'Templates', href: '/admin/templates', icon: <Icons.Layout /> },
        { label: 'Winners Bank', href: '/admin/winners', icon: <Icons.Trophy /> },
      ],
    });

    // Audience - always visible
    sections.push({
      title: 'Audience',
      items: [
        { label: 'Personas', href: '/admin/audience', icon: <Icons.Users /> },
      ],
    });

    // Products - always visible
    sections.push({
      title: 'Products',
      items: [
        { label: 'Products', href: '/admin/products', icon: <Icons.Package /> },
        { label: 'Brands', href: '/admin/brands', icon: <Icons.Building /> },
      ],
    });

    // Video Production - only for agency/admin users
    if (isAgencyUser) {
      sections.push({
        title: 'Video Production',
        items: [
          { label: 'Video Pipeline', href: '/admin/pipeline', icon: <Icons.Video /> },
          { label: 'Calendar', href: '/admin/calendar', icon: <Icons.Calendar /> },
          { label: 'Performance', href: '/admin/analytics', icon: <Icons.BarChart /> },
          { label: 'Activity', href: '/admin/activity', icon: <Icons.Activity /> },
        ],
      });
    }

    // Settings - always visible
    sections.push({
      title: 'Settings',
      items: [
        { label: 'Account', href: '/admin/settings', icon: <Icons.Settings /> },
        { label: 'Billing', href: '/upgrade', icon: <Icons.CreditCard /> },
      ],
    });

    // Admin Tools - only for admins
    if (auth.isAdmin) {
      sections.push({
        title: 'Admin Tools',
        items: [
          { label: 'System Health', href: '/admin/ops', icon: <Icons.Server /> },
          { label: 'Team Members', href: '/admin/users', icon: <Icons.Users /> },
          { label: 'System Settings', href: '/admin/status', icon: <Icons.Shield /> },
        ],
      });
    }

    return sections;
  };

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b] text-zinc-500">
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

  const navSections = getNavSections();

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-zinc-900/95 border-r border-white/10 z-50 transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src={BRAND.logo}
                alt={BRAND.name}
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="font-semibold text-zinc-100">{BRAND.name}</span>
            </Link>
            {isMobile && (
              <button
                onClick={closeSidebar}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <Icons.Close />
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            {navSections.map((section, idx) => (
              <div key={idx} className="mb-6">
                <div className="px-4 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {section.title}
                </div>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && closeSidebar()}
                    className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all ${
                      isActive(item.href)
                        ? 'bg-white/10 text-white'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className={isActive(item.href) ? 'text-blue-400' : ''}>{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          {/* Sidebar footer - notifications */}
          <div className="p-4 border-t border-white/10">
            <Link
              href="/admin/notifications"
              className="flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <Icons.Bell />
              <span className="text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
                  {unreadCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen && !isMobile ? 'ml-64' : 'ml-0'
        }`}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 h-16 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5">
          {/* Left: Menu toggle + Logo (mobile) */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <Icons.Close /> : <Icons.Menu />}
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
                  {auth.userEmail?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="hidden md:inline text-sm max-w-[150px] truncate">
                  {auth.userEmail || 'User'}
                </span>
                <Icons.ChevronDown />
              </button>

              {/* Dropdown */}
              {userMenuOpen && (
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
                      <Icons.User />
                      Account Settings
                    </Link>
                    <Link
                      href="/upgrade"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <Icons.Zap />
                      Upgrade Plan
                    </Link>
                  </div>

                  <div className="border-t border-white/10 pt-1">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
                    >
                      <Icons.LogOut />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
