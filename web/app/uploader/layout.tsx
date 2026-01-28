'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/app/components/Sidebar';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  role: UserRole;
  userId: string | null;
}

export default function UploaderLayout({ children }: { children: ReactNode }) {
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
      <Sidebar role={auth.role} unreadNotifications={unreadCount} />
      <main
        style={{
          flex: 1,
          marginLeft: '220px',
          backgroundColor: colors.bg,
          minHeight: '100vh',
        }}
      >
        {children}
      </main>
    </div>
  );
}
