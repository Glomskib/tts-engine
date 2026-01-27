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

  if (auth.loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        color: '#666',
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
      <Sidebar role={auth.role} unreadNotifications={unreadCount} />
      <main
        style={{
          flex: 1,
          marginLeft: '220px',
          backgroundColor: '#f8f9fa',
          minHeight: '100vh',
        }}
      >
        {children}
      </main>
    </div>
  );
}
