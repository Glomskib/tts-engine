'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
  collapsed?: boolean;
}

interface SidebarProps {
  role: UserRole;
  unreadNotifications?: number;
}

export default function Sidebar({ role, unreadNotifications = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  const isActive = (href: string) => {
    if (href === '/admin/pipeline') {
      return pathname === '/admin/pipeline' || pathname.startsWith('/admin/pipeline/');
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Role-specific navigation
  const getNavSections = (): NavSection[] => {
    const sections: NavSection[] = [];

    // Everyone gets notifications at top
    sections.push({
      items: [
        {
          label: unreadNotifications > 0 ? `Inbox (${unreadNotifications})` : 'Inbox',
          href: '/admin/notifications',
          icon: '🔔',
        },
      ],
    });

    if (role === 'recorder') {
      sections.push({
        title: 'Recording',
        items: [
          { label: 'My Tasks', href: '/admin/recorder/workbench', icon: '📋' },
          { label: 'Record Queue', href: '/admin/pipeline?filter=record', icon: '🎬' },
        ],
      });
    }

    if (role === 'editor') {
      sections.push({
        title: 'Editing',
        items: [
          { label: 'My Tasks', href: '/admin/editor/workbench', icon: '📋' },
          { label: 'Edit Queue', href: '/admin/pipeline?filter=edit', icon: '✂️' },
        ],
      });
    }

    if (role === 'uploader') {
      sections.push({
        title: 'Uploading',
        items: [
          { label: 'My Tasks', href: '/admin/uploader/workbench', icon: '📋' },
          { label: 'Post Queue', href: '/uploader', icon: '🚀' },
          { label: 'Posted Log', href: '/admin/pipeline?filter=posted', icon: '📊' },
        ],
      });
    }

    if (role === 'admin') {
      sections.push({
        title: 'Pipeline',
        items: [
          { label: 'All Videos', href: '/admin/pipeline', icon: '📺' },
          { label: 'Approvals', href: '/admin/pipeline?filter=approve', icon: '✅' },
          { label: 'Post Queue', href: '/uploader', icon: '🚀' },
        ],
      });

      sections.push({
        title: 'Content',
        items: [
          { label: 'Brands', href: '/admin/brands', icon: '🏷️' },
          { label: 'Products', href: '/admin/products', icon: '📦' },
          { label: 'Scripts', href: '/admin/scripts', icon: '📝' },
        ],
      });

      sections.push({
        title: 'Insights',
        items: [
          { label: 'Analytics', href: '/admin/analytics', icon: '📈' },
          { label: 'Events', href: '/admin/events', icon: '📋' },
        ],
      });
    }

    return sections;
  };

  // Admin advanced section (collapsed by default)
  const adminAdvancedItems: NavItem[] = [
    { label: 'Ops', href: '/admin/ops', icon: '⚙️' },
    { label: 'Ingestion', href: '/admin/ingestion', icon: '📥' },
    { label: 'Assignments', href: '/admin/assignments', icon: '👥' },
    { label: 'Users', href: '/admin/users', icon: '👤' },
    { label: 'Upgrades', href: '/admin/upgrade-requests', icon: '⬆️' },
    { label: 'Client Orgs', href: '/admin/client-orgs', icon: '🏢' },
    { label: 'Requests', href: '/admin/requests', icon: '📨' },
    { label: 'Billing', href: '/admin/billing', icon: '💳' },
    { label: 'Settings', href: '/admin/settings', icon: '🔧' },
    { label: 'Status', href: '/admin/status', icon: '🔍' },
  ];

  const navSections = getNavSections();

  return (
    <aside
      style={{
        width: '220px',
        minHeight: '100vh',
        backgroundColor: '#1a1a2e',
        color: '#e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      {/* Logo/Brand */}
      <div
        style={{
          padding: '20px 16px',
          borderBottom: '1px solid #2d2d44',
        }}
      >
        <Link
          href="/"
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '24px' }}>🎬</span>
          <span style={{ fontWeight: 'bold', fontSize: '16px' }}>TTS Engine</span>
        </Link>
      </div>

      {/* Nav Sections */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {navSections.map((section, sectionIdx) => (
          <div key={sectionIdx} style={{ marginBottom: '16px' }}>
            {section.title && (
              <div
                style={{
                  padding: '8px 16px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  color: '#888',
                  letterSpacing: '0.5px',
                }}
              >
                {section.title}
              </div>
            )}
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 16px',
                  textDecoration: 'none',
                  color: isActive(item.href) ? '#fff' : '#b0b0b0',
                  backgroundColor: isActive(item.href) ? '#2d2d44' : 'transparent',
                  borderLeft: isActive(item.href) ? '3px solid #4dabf7' : '3px solid transparent',
                  fontSize: '14px',
                  fontWeight: isActive(item.href) ? 'bold' : 'normal',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.label.includes('Inbox') && unreadNotifications > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      backgroundColor: '#e03131',
                      color: 'white',
                      borderRadius: '10px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  >
                    {unreadNotifications}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}

        {/* Admin Advanced Section */}
        {role === 'admin' && (
          <div style={{ marginTop: '8px', borderTop: '1px solid #2d2d44', paddingTop: '8px' }}>
            <button
              onClick={() => setAdvancedExpanded(!advancedExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: '#888',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <span>{advancedExpanded ? '▼' : '▶'}</span>
              <span>Advanced</span>
            </button>
            {advancedExpanded && (
              <div>
                {adminAdvancedItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 16px 8px 28px',
                      textDecoration: 'none',
                      color: isActive(item.href) ? '#fff' : '#888',
                      backgroundColor: isActive(item.href) ? '#2d2d44' : 'transparent',
                      fontSize: '13px',
                      fontWeight: isActive(item.href) ? 'bold' : 'normal',
                    }}
                  >
                    <span style={{ fontSize: '12px' }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User/Role indicator at bottom */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid #2d2d44',
          fontSize: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#888',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#40c057',
            }}
          />
          <span style={{ textTransform: 'capitalize' }}>{role || 'Guest'}</span>
        </div>
      </div>
    </aside>
  );
}
