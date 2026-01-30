'use client';

import { useState, useEffect, ReactNode } from 'react';
import Sidebar from './Sidebar';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface AppLayoutProps {
  children: ReactNode;
}

const SIDEBAR_STORAGE_KEY = 'applayout-sidebar-open';
const MOBILE_BREAKPOINT = 768;

export default function AppLayout({ children }: AppLayoutProps) {
  const [role, setRole] = useState<UserRole>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
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
    // Fetch user role
    const fetchRole = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setRole(data.role || null);
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

  const closeSidebar = () => setSidebarOpen(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b] text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        role={role}
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
