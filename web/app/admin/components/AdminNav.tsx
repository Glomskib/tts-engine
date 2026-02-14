'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AdminNavProps {
  isAdmin: boolean;
  showNotificationBadge?: React.ReactNode;
  rightContent?: React.ReactNode;
}

/**
 * Standardized admin navigation component.
 *
 * Navigation Order:
 *   Work: Workbench, Pipeline
 *   Insight: Analytics, Events
 *   Admin/Control (admin-only): Users, Upgrades, Settings, Status
 */
export default function AdminNav({ isAdmin, showNotificationBadge, rightContent }: AdminNavProps) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const linkStyle = (path: string, color?: string) => ({
    color: isActive(path) ? '#000' : (color || '#1971c2'),
    fontSize: '13px',
    fontWeight: isActive(path) ? 'bold' as const : 'normal' as const,
    textDecoration: 'none',
  });

  const groupLabelStyle = {
    fontSize: '10px',
    color: '#868e96',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginRight: '6px',
  };

  const separatorStyle = {
    color: '#dee2e6',
    margin: '0 2px',
  };

  const groupSeparatorStyle = {
    width: '1px',
    height: '16px',
    backgroundColor: '#adb5bd',
    margin: '0 12px',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap',
      padding: '8px 0',
    }}>
      {/* Create Group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={groupLabelStyle}>Create</span>
        <Link href="/admin/content-studio" style={linkStyle('/admin/content-studio')}>
          Studio
        </Link>
        <span style={separatorStyle}>|</span>
        <Link href="/admin/skit-library" style={linkStyle('/admin/skit-library')}>
          Scripts
        </Link>
      </div>

      <div style={groupSeparatorStyle} />

      {/* Pipeline Group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={groupLabelStyle}>Pipeline</span>
        <Link href="/admin/pipeline" style={linkStyle('/admin/pipeline')}>
          Board
        </Link>
        <span style={separatorStyle}>|</span>
        <Link href="/admin/posting-queue" style={linkStyle('/admin/posting-queue')}>
          Posting
        </Link>
      </div>

      <div style={groupSeparatorStyle} />

      {/* Insights Group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={groupLabelStyle}>Insights</span>
        <Link href="/admin/winners" style={linkStyle('/admin/winners')}>
          Winners
        </Link>
        <span style={separatorStyle}>|</span>
        <Link href="/admin/products" style={linkStyle('/admin/products')}>
          Products
        </Link>
        <span style={separatorStyle}>|</span>
        <Link href="/admin/brands" style={linkStyle('/admin/brands')}>
          Brands
        </Link>
        <span style={separatorStyle}>|</span>
        <Link href="/admin/analytics" style={linkStyle('/admin/analytics')}>
          Analytics
        </Link>
      </div>

      {showNotificationBadge}

      {/* Admin/Control Group - only shown to admins */}
      {isAdmin && (
        <>
          <div style={groupSeparatorStyle} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={groupLabelStyle}>Admin</span>
            <Link href="/admin/ops" style={linkStyle('/admin/ops', '#e03131')}>
              Ops
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/ingestion" style={linkStyle('/admin/ingestion')}>
              Ingestion
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/hook-suggestions" style={linkStyle('/admin/hook-suggestions')}>
              Hook Review
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/assignments" style={linkStyle('/admin/assignments')}>
              Assignments
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/users" style={linkStyle('/admin/users')}>
              Users
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/upgrade-requests" style={linkStyle('/admin/upgrade-requests')}>
              Upgrades
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/client-orgs" style={linkStyle('/admin/client-orgs')}>
              Client Orgs
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/requests" style={linkStyle('/admin/requests')}>
              Requests
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/billing" style={linkStyle('/admin/billing')}>
              Billing
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/settings" style={linkStyle('/admin/settings')}>
              Settings
            </Link>
            <span style={separatorStyle}>|</span>
            <Link href="/admin/status" style={linkStyle('/admin/status')}>
              Status
            </Link>
          </div>
        </>
      )}

      {/* Right-aligned content (e.g., filters) */}
      {rightContent && (
        <div style={{ marginLeft: 'auto' }}>
          {rightContent}
        </div>
      )}
    </div>
  );
}
