'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface NotificationBadgeProps {
  style?: React.CSSProperties;
}

export default function NotificationBadge({ style }: NotificationBadgeProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch('/api/notifications?limit=1&unread_only=true');
      const data = await res.json();
      if (data.ok) {
        setUnreadCount(data.meta?.unread_count || 0);
      }
    } catch (err) {
      // Silent fail - badge is non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Link
      href="/admin/notifications"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 12px',
        backgroundColor: unreadCount > 0 ? '#fff5f5' : '#f8f9fa',
        border: `1px solid ${unreadCount > 0 ? '#ffc9c9' : '#dee2e6'}`,
        borderRadius: '4px',
        textDecoration: 'none',
        color: unreadCount > 0 ? '#c92a2a' : '#495057',
        fontSize: '13px',
        fontWeight: unreadCount > 0 ? 'bold' : 'normal',
        ...style,
      }}
    >
      <span style={{ fontSize: '14px' }}>
        {loading ? '...' : unreadCount > 0 ? unreadCount : 0}
      </span>
      <span>Notifications</span>
      {unreadCount > 0 && (
        <span style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          backgroundColor: '#fa5252',
          borderRadius: '50%',
        }} />
      )}
    </Link>
  );
}
