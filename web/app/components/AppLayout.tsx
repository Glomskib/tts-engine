'use client';

import { useState, useEffect, ReactNode } from 'react';
import Sidebar from './Sidebar';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [role, setRole] = useState<UserRole>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar role={role} unreadNotifications={unreadCount} />
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
