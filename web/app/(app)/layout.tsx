'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCredits } from '@/hooks/useCredits';
import { SIDEBAR_WIDTH, SIDEBAR_STORAGE_KEY, MOBILE_BREAKPOINT } from '@/lib/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { AppHeader } from '@/components/AppHeader';
import { useAuth } from '@/contexts/AuthContext';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { subscription } = useCredits();
  const { loading: authLoading, authenticated, user, role, isAdmin } = useAuth();

  const auth = {
    loading: authLoading,
    authenticated,
    role: role as 'admin' | 'recorder' | 'editor' | 'uploader' | null,
    userId: user?.id || null,
    userEmail: user?.email || null,
    isAdmin,
  };

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

  // Redirect to login if not authenticated, or to dashboard on root
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.authenticated) {
      router.replace('/login');
      return;
    }
    if (pathname === '/') {
      router.replace('/admin/dashboard');
    }
  }, [auth.loading, auth.authenticated, pathname, router]);

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

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <AppSidebar
        isAdmin={auth.isAdmin}
        planId={subscription?.planId}
        unreadNotifications={unreadCount}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isMobile={isMobile}
      />

      {/* Main content */}
      <main
        className="flex-1 transition-all duration-300"
        style={{
          marginLeft: isMobile ? 0 : (sidebarOpen ? SIDEBAR_WIDTH : 0),
        }}
      >
        <AppHeader
          userEmail={auth.userEmail}
          planName={subscription?.planName}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
        />

        {/* Page content */}
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
