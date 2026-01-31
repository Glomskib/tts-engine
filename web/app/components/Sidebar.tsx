'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { BRAND, hasVideoProductionAccess } from '@/lib/brand';
import { useCredits } from '@/hooks/useCredits';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
  showFor?: ('creator' | 'agency' | 'admin')[];
}

interface SidebarProps {
  role: UserRole;
  unreadNotifications?: number;
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

// Icons as inline SVGs for consistency
const Icons = {
  Zap: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />
    </svg>
  ),
  FileText: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Layout: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  Trophy: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Package: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4l-9-5.19" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Building: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  ),
  Video: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23,7 16,12 23,17 23,7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  Calendar: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  BarChart: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  Activity: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  CreditCard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  Server: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  Bell: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Close: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

export default function Sidebar({ role, unreadNotifications = 0, isOpen, onClose, isMobile }: SidebarProps) {
  const pathname = usePathname();
  const { subscription } = useCredits();

  const isAdmin = role === 'admin';
  const isAgencyUser = hasVideoProductionAccess(subscription?.planId, isAdmin);

  const isActive = (href: string) => {
    if (href === '/admin/skit-generator') {
      return pathname === '/admin/skit-generator';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Build navigation sections based on user type
  const getNavSections = (): NavSection[] => {
    const sections: NavSection[] = [];

    // Content Creation - always visible
    sections.push({
      title: 'Content Creation',
      items: [
        { label: 'Script Generator', href: '/admin/skit-generator', icon: <Icons.Zap /> },
        { label: 'Script Library', href: '/admin/skit-library', icon: <Icons.FileText /> },
        { label: 'Templates', href: '/admin/templates', icon: <Icons.Layout /> },
        { label: 'Winners Bank', href: '/admin/winners', icon: <Icons.Trophy /> },
      ],
    });

    // Audience - always visible
    sections.push({
      title: 'Audience',
      items: [
        { label: 'Personas', href: '/admin/audience', icon: <Icons.Users /> },
      ],
    });

    // Products - always visible
    sections.push({
      title: 'Products',
      items: [
        { label: 'Products', href: '/admin/products', icon: <Icons.Package /> },
        { label: 'Brands', href: '/admin/brands', icon: <Icons.Building /> },
      ],
    });

    // Video Production - only for agency/admin users
    if (isAgencyUser) {
      sections.push({
        title: 'Video Production',
        showFor: ['agency', 'admin'],
        items: [
          { label: 'Video Pipeline', href: '/admin/pipeline', icon: <Icons.Video /> },
          { label: 'Calendar', href: '/admin/calendar', icon: <Icons.Calendar /> },
          { label: 'Performance', href: '/admin/analytics', icon: <Icons.BarChart /> },
          { label: 'Activity', href: '/admin/activity', icon: <Icons.Activity /> },
        ],
      });
    }

    // Settings - always visible
    sections.push({
      title: 'Settings',
      items: [
        { label: 'Account', href: '/admin/settings', icon: <Icons.Settings /> },
        { label: 'Billing', href: '/upgrade', icon: <Icons.CreditCard /> },
      ],
    });

    // Admin Tools - only for admins
    if (isAdmin) {
      sections.push({
        title: 'Admin',
        showFor: ['admin'],
        items: [
          { label: 'System Health', href: '/admin/ops', icon: <Icons.Server /> },
          { label: 'Team Members', href: '/admin/users', icon: <Icons.Users /> },
        ],
      });
    }

    return sections;
  };

  const navSections = getNavSections();

  const handleLinkClick = () => {
    if (isMobile) {
      onClose();
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-zinc-900/95 border-r border-white/10 z-50 transform transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo/Brand Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <Link
            href="/"
            onClick={handleLinkClick}
            className="flex items-center gap-2.5 text-zinc-100 no-underline"
          >
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-semibold text-[15px] tracking-tight">{BRAND.name}</span>
          </Link>
          {isMobile && (
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <Icons.Close />
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto py-4">
          {navSections.map((section, sectionIdx) => (
            <div key={sectionIdx} className="mb-6">
              <div className="px-4 mb-2 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                {section.title}
              </div>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleLinkClick}
                  className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all ${
                    isActive(item.href)
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={isActive(item.href) ? 'text-blue-400' : ''}>{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer - Notifications */}
        <div className="p-4 border-t border-white/10">
          <Link
            href="/admin/notifications"
            onClick={handleLinkClick}
            className="flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <Icons.Bell />
            <span className="text-sm">Notifications</span>
            {unreadNotifications > 0 && (
              <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
                {unreadNotifications}
              </span>
            )}
          </Link>
        </div>
      </aside>
    </>
  );
}
