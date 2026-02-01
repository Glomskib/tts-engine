'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useCredits } from '@/hooks/useCredits';
import { SIDEBAR_WIDTH, SIDEBAR_STORAGE_KEY, MOBILE_BREAKPOINT } from '@/lib/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { AppHeader } from '@/components/AppHeader';
import OnboardingModal, { useOnboarding } from '@/components/OnboardingModal';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface AppLayoutProps {
  children: ReactNode;
}

interface AuthState {
  role: UserRole;
  userEmail: string | null;
  isAdmin: boolean;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { subscription } = useCredits();
  const [auth, setAuth] = useState<AuthState>({
    role: null,
    userEmail: null,
    isAdmin: false,
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const { shouldShow: showOnboarding, markComplete: completeOnboarding } = useOnboarding();

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
    // Fetch user role
    const fetchRole = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setAuth({
            role: data.role || null,
            userEmail: data.user?.email || null,
            isAdmin: data.isAdmin || false,
          });
        }
      } catch (err) {
        console.error('Failed to fetch role:', err);
      } finally {
        setLoading(false);
      }
    };

    // Fetch unread notification count
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

    fetchRole();
    fetchNotifications();

    // Poll notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b] text-zinc-500">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <AppSidebar
        isAdmin={auth.isAdmin}
        planId={subscription?.planId}
        unreadNotifications={unreadCount}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isMobile={isMobile}
      />

      {/* Main content - offset by sidebar width on desktop */}
      <div className="lg:ml-72 min-h-screen flex flex-col">
        <AppHeader
          userEmail={auth.userEmail}
          planName={subscription?.planName}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
        />

        {/* Page content with proper padding */}
        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Onboarding modal for new users */}
      {showOnboarding && (
        <OnboardingModal onComplete={completeOnboarding} />
      )}
    </div>
  );
}
