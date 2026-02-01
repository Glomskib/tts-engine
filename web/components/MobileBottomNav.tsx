'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutGrid,
  Film,
  Users,
  Bell,
  Menu
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin/pipeline', icon: LayoutGrid, label: 'Queue' },
  { href: '/admin/content-studio', icon: Film, label: 'Studio' },
  { href: '/admin/winners', icon: Users, label: 'Winners' },
  { href: '/admin/notifications', icon: Bell, label: 'Activity' },
  { href: '#more', icon: Menu, label: 'More', isDrawerTrigger: true },
];

interface MobileBottomNavProps {
  onMoreClick: () => void;
  unreadCount?: number;
}

export function MobileBottomNav({ onMoreClick, unreadCount = 0 }: MobileBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="
      fixed bottom-0 left-0 right-0 z-50 lg:hidden
      bg-zinc-950 border-t border-zinc-800
      pb-[env(safe-area-inset-bottom)]
    ">
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href !== '#more' && pathname.startsWith(item.href);
          const Icon = item.icon;

          if (item.isDrawerTrigger) {
            return (
              <button
                key={item.label}
                onClick={onMoreClick}
                className="flex flex-col items-center justify-center w-16 h-14 gap-1"
              >
                <Icon className="w-6 h-6 text-zinc-400" />
                <span className="text-[11px] text-zinc-400">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center justify-center w-16 h-14 gap-1"
            >
              <div className="relative">
                <Icon className={`w-6 h-6 ${isActive ? 'text-teal-400' : 'text-zinc-400'}`} />
                {item.href === '/admin/notifications' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[11px] ${isActive ? 'text-teal-400' : 'text-zinc-400'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
