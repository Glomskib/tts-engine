'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/app/components/Sidebar';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { CreditsBadge } from '@/components/CreditsBadge';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  role: UserRole;
  userId: string | null;
}

const SIDEBAR_STORAGE_KEY = 'admin-sidebar-open';
const MOBILE_BREAKPOINT = 768;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const [auth, setAuth] = useState<AuthState>({
    loading: true,
    authenticated: false,
    role: null,
    userId: null,
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);

      // On mobile, sidebar starts closed; on desktop, restore from storage
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

  // Save sidebar preference (desktop only)
  useEffect(() => {
    if (!isMobile) {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
    }
  }, [sidebarOpen, isMobile]);

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
            });
          } else {
            setAuth({ loading: false, authenticated: false, role: null, userId: null });
            router.replace('/login');
          }
        } else {
          setAuth({ loading: false, authenticated: false, role: null, userId: null });
          router.replace('/login');
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setAuth({ loading: false, authenticated: false, role: null, userId: null });
      }
    };

    fetchAuth();
  }, [pathname, router]);

  // Fetch notifications count
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

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  if (auth.loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: colors.bg,
        color: colors.textMuted,
      }}>
        Loading...
      </div>
    );
  }

  if (!auth.authenticated) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        role={auth.role}
        unreadNotifications={unreadCount}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isMobile={isMobile}
      />
      <main
        style={{
          flex: 1,
          marginLeft: isMobile ? 0 : (sidebarOpen ? '260px' : 0),
          backgroundColor: colors.bg,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          transition: 'margin-left 0.3s ease',
        }}
      >
        {/* Top bar with hamburger and credits */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 24px',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          <button
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              background: 'none',
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: colors.text,
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.bgHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {sidebarOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
          <CreditsBadge showPlan />
        </div>
        <div style={{ flex: 1, padding: isMobile ? '16px' : '0' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
