'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/app/components/Sidebar';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  role: UserRole;
  userId: string | null;
}

const SIDEBAR_STORAGE_KEY = 'app-sidebar-open';
const MOBILE_BREAKPOINT = 768;

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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

            // Redirect non-admin to /my-tasks if on root or admin pages (except allowed ones)
            if (data.role !== 'admin' && pathname === '/') {
              router.replace('/my-tasks');
            }
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

  const closeSidebar = () => setSidebarOpen(false);

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b] text-zinc-500">
        Loading...
      </div>
    );
  }

  if (!auth.authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        role={auth.role}
        unreadNotifications={unreadCount}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isMobile={isMobile}
      />
      <main
        className="flex-1 bg-[#09090b] min-h-screen transition-all duration-300"
        style={{
          marginLeft: isMobile ? 0 : (sidebarOpen ? '260px' : 0),
        }}
      >
        {children}
      </main>
    </div>
  );
}
