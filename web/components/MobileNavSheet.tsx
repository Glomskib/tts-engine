'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, Home } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { isNavItemActive, type NavSectionResolved } from '@/lib/navigation';

interface MobileNavSheetProps {
  open: boolean;
  onClose: () => void;
  navSections: NavSectionResolved[];
  pathname: string;
  isAdmin?: boolean;
}

export function MobileNavSheet({ open, onClose, navSections, pathname }: MobileNavSheetProps) {
  // Separate HOME section (render flat) from the rest (render as accordions)
  const sections = useMemo(() => {
    return navSections.filter((s) => s.items.length > 0);
  }, [navSections]);

  // Auto-expand the section containing the active page
  const activeSectionTitle = useMemo(() => {
    for (const section of sections) {
      if (section.items.some((item) => isNavItemActive(pathname, item.href))) {
        return section.title;
      }
    }
    return null;
  }, [sections, pathname]);

  const [expandedTitle, setExpandedTitle] = useState<string | null>(activeSectionTitle);

  const toggleSection = (title: string) => {
    setExpandedTitle((prev) => (prev === title ? null : title));
  };

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Navigate" size="large">
      <div className="space-y-1">
        {/* Dashboard link at top */}
        <Link
          href="/admin/dashboard"
          onClick={onClose}
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl transition-colors
            ${isNavItemActive(pathname, '/admin/dashboard')
              ? 'bg-teal-500/15 text-teal-400'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }
          `}
        >
          <Home className="w-5 h-5 flex-shrink-0" />
          <span className="text-[15px] font-medium">Dashboard</span>
        </Link>

        <div className="h-px bg-zinc-800 mx-3 my-1" />

        {sections.map((section) => {
          const isExpanded = expandedTitle === section.title;
          return (
            <div key={section.title}>
              {/* Section header */}
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                className="flex items-center justify-between w-full px-3 py-3.5 rounded-xl text-left hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors"
              >
                <span className="text-[15px] font-semibold text-zinc-200">
                  {section.title}
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
                  {section.items.map((item) => {
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
