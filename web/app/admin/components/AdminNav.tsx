'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AdminNavProps {
  isAdmin: boolean;
  showNotificationBadge?: React.ReactNode;
  rightContent?: React.ReactNode;
}

/**
 * @deprecated 2026-05-02 — superseded by `AdminSidebar` (canonical) +
 *   `AdminMobileHeader` / `AdminMobileDrawer`. The horizontal admin link strip
 *   was the third sidebar surface that triggered Brandon's "3 different
 *   sidebars across /admin pages" bug. All consumers were migrated off
 *   `showNav` in the same commit; this file is kept temporarily so direct
 *   imports continue to compile, but DO NOT add new callers — every nav
 *   surface must go through `lib/navigation.ts`.
 *
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

  // Hidden on mobile — MobileBottomNav + the side-drawer in admin/layout.tsx
  // already cover small-screen navigation. Showing this 25-link wrap-everywhere
  // strip on a phone made the page feel broken (5+ wrapped rows of unstyled
  // links). Desktop/tablet still see the full grouped strip.
  return (
    <div className="hidden md:flex" style={{
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap',
      padding: '8px 0',
      rowGap: '12px',
    }}>
      {/* Create Group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={groupLabelStyle}>Create</span>
        <Link href="/admin/footage" style={linkStyle('/admin/footage', '#6366f1')}>
          Footage Hub
        </Link>
        <span style={separatorStyle}>|</span>
        <Link href="/admin/content-studio" style={linkStyle('/admin/content-studio')}>
          Studio
        </Link>
        <span style={separatorStyle}>|</span>
        <Link href="/admin/creator/clip-studio" style={linkStyle('/admin/creator/clip-studio', '#0d9488')}>
          Clip Studio
        </Link>
        <span style={separatorStyle}>|</span>
        <Link href="/admin/script-library" style={linkStyle('/admin/script-library')}>
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
        <Link href="/admin/winners-bank" style={linkStyle('/admin/winners-bank')}>
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
        <span style={separatorStyle}>|</span>
        <Link href="/admin/link-hub" style={linkStyle('/admin/link-hub', '#2f9e44')}>
          Link Hub
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
            <Link href="/admin/render-jobs" style={linkStyle('/admin/render-jobs', '#0d9488')}>
              Render Nodes
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
