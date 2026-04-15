'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  FileText,
  Folder,
  Menu,
  Video,
  Calendar,
  Trophy,
  BarChart3,
  Package,
  Youtube,
  ListTodo
} from 'lucide-react';

// All available nav items for middle slots (content-studio is the fixed first slot)
const AVAILABLE_NAV_ITEMS = [
  { id: 'transcribe', href: '/admin/transcribe', icon: FileText, label: 'Transcribe' },
  { id: 'youtube-transcribe', href: '/admin/youtube-transcribe', icon: Youtube, label: 'YouTube' },
  { id: 'script-library', href: '/admin/script-library', icon: Folder, label: 'Scripts' },
  { id: 'pipeline', href: '/admin/pipeline', icon: Video, label: 'Videos' },
  { id: 'calendar', href: '/admin/calendar', icon: Calendar, label: 'Plan' },
  { id: 'winners', href: '/admin/intelligence/winners-bank', icon: Trophy, label: 'Ideas' },
  { id: 'analytics', href: '/admin/analytics', icon: BarChart3, label: 'Stats' },
  { id: 'brands', href: '/admin/brands', icon: Package, label: 'Brands' },
  { id: 'content-items', href: '/admin/content-items', icon: ListTodo, label: 'Items' },
];

const DEFAULT_MIDDLE_SLOTS = ['pipeline', 'calendar', 'winners'];

interface MobileBottomNavProps {
  onMoreClick: () => void;
  unreadCount?: number;
}

export function MobileBottomNav({ onMoreClick, unreadCount = 0 }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [middleSlots, setMiddleSlots] = useState<string[]>(DEFAULT_MIDDLE_SLOTS);

  // Load saved nav config
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('flashflow_bottom_nav');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === 3) {
            setMiddleSlots(parsed);
          }
        } catch (e) {
          // Invalid JSON, use defaults
        }
      }
    }
  }, []);

  const middleItems = middleSlots
    .map(id => AVAILABLE_NAV_ITEMS.find(item => item.id === id))
    .filter((item): item is typeof AVAILABLE_NAV_ITEMS[0] => item !== undefined);

  const NAV_ITEMS = [
    { href: '/admin/content-studio', icon: Sparkles, label: 'Create', isDrawerTrigger: false },
    ...middleItems.map(item => ({ ...item, isDrawerTrigger: false })),
    { href: '#more', icon: Menu, label: 'More', isDrawerTrigger: true },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className="
        fixed bottom-0 left-0 right-0 z-50 lg:hidden
        bg-zinc-950 border-t border-zinc-800
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <div className="flex items-stretch justify-between h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href !== '#more' && pathname.startsWith(item.href);
          const Icon = item.icon;

          if (item.isDrawerTrigger) {
            return (
              <button
                type="button"
                key={item.label}
                onClick={onMoreClick}
                aria-label="Open menu"
                className="flex-1 flex flex-col items-center justify-center gap-1 relative group"
              >
                <Icon className="w-5 h-5 text-zinc-400 group-hover:text-zinc-300" aria-hidden="true" />
                <span className="text-[10px] text-zinc-400 group-hover:text-zinc-300">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative group"
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? 'text-teal-400' : 'text-zinc-400 group-hover:text-zinc-300'
                  }`}
                  aria-hidden="true"
                />
                {item.href === '/admin/notifications' && unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                    aria-label={`${unreadCount} unread notifications`}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] transition-colors ${
                  isActive ? 'text-teal-400 font-medium' : 'text-zinc-400 group-hover:text-zinc-300'
                }`}
              >
                {item.label}
              </span>
              {/* Active indicator line */}
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
