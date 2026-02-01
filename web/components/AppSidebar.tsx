'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { getNavSections, isNavItemActive, SIDEBAR_WIDTH } from '@/lib/navigation';
import { NavIcon } from '@/components/icons/NavIcons';

interface AppSidebarProps {
  isAdmin: boolean;
  isAgencyUser: boolean;
  unreadNotifications?: number;
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export function AppSidebar({
  isAdmin,
  isAgencyUser,
  unreadNotifications = 0,
  isOpen,
  onClose,
  isMobile,
}: AppSidebarProps) {
  const pathname = usePathname();
  const navSections = getNavSections({ isAgencyUser, isAdmin });

  const handleLinkClick = () => {
    if (isMobile) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 bg-zinc-900/95 border-r border-white/10 z-50 transform transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: SIDEBAR_WIDTH }}
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
              <NavIcon name="Close" />
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
              {section.items.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleLinkClick}
                    className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all ${
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className={active ? 'text-blue-400' : ''}>
                      <NavIcon name={item.iconName} />
                    </span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                );
              })}
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
            <NavIcon name="Bell" />
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
