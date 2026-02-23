'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { isNavItemActive, type NavSectionResolved } from '@/lib/navigation';

interface NavGroup {
  label: string;
  sectionTitles: string[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: 'Create', sectionTitles: ['CREATE'] },
  { label: 'Pipeline', sectionTitles: ['PIPELINE'] },
  { label: 'Audience & Products', sectionTitles: ['AUDIENCE', 'PRODUCTS'] },
  { label: 'Settings & System', sectionTitles: ['HOME', 'SETTINGS', 'SYSTEM', 'COMMAND CENTER'] },
];

interface MobileNavSheetProps {
  open: boolean;
  onClose: () => void;
  navSections: NavSectionResolved[];
  pathname: string;
}

export function MobileNavSheet({ open, onClose, navSections, pathname }: MobileNavSheetProps) {
  // Build grouped items from nav sections
  const groups = useMemo(() => {
    return NAV_GROUPS.map((group) => {
      const items = navSections
        .filter((s) => group.sectionTitles.includes(s.title))
        .flatMap((s) => s.items);
      return { label: group.label, items };
    }).filter((g) => g.items.length > 0);
  }, [navSections]);

  // Auto-expand the group containing the active page
  const activeGroupIndex = useMemo(() => {
    return groups.findIndex((g) =>
      g.items.some((item) => isNavItemActive(pathname, item.href))
    );
  }, [groups, pathname]);

  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    activeGroupIndex >= 0 ? activeGroupIndex : null
  );

  const toggleGroup = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Navigate" size="large">
      <div className="space-y-1">
        {groups.map((group, idx) => {
          const isExpanded = expandedIndex === idx;
          return (
            <div key={group.label}>
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(idx)}
                className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl text-left hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors"
              >
                <span className="text-[15px] font-semibold text-zinc-200">
                  {group.label}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-zinc-500 transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Expanded items */}
              {isExpanded && (
                <div className="ml-1 mb-2 space-y-0.5">
                  {group.items.map((item) => {
                    const active = isNavItemActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`
                          flex items-center gap-3 px-4 py-3 rounded-xl transition-colors
                          ${active
                            ? 'bg-teal-500/15 text-teal-400'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                          }
                        `}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="text-[15px] font-medium">{item.name}</span>
                        {item.locked && (
                          <span className="ml-auto text-[11px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                            {item.requiredPlanName}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}
