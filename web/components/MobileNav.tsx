'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  activeIcon?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Home',
    href: '/admin/pipeline',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    label: 'Generate',
    href: '/admin/skit-generator',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    label: 'Library',
    href: '/admin/skit-library',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  },
  {
    label: 'Analytics',
    href: '/admin/usage',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    label: 'More',
    href: '/admin/settings',
    icon: 'M4 6h16M4 12h16M4 18h16',
  },
];

export default function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/admin/pipeline') {
      return pathname === '/admin/pipeline' || pathname === '/admin';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-lg border-t border-white/10 z-50 md:hidden safe-area-inset-bottom">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-2 px-3 min-w-[60px] transition-colors ${
                active ? 'text-violet-400' : 'text-zinc-500'
              }`}
            >
              <svg
                className={`w-6 h-6 ${active ? 'text-violet-400' : 'text-zinc-500'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={active ? 2.5 : 2}
                  d={item.icon}
                />
              </svg>
              <span className={`text-[10px] mt-0.5 ${active ? 'font-medium' : ''}`}>
                {item.label}
              </span>
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-violet-400 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Floating action button for mobile
interface MobileFABProps {
  onClick?: () => void;
  href?: string;
  icon?: string;
  label?: string;
}

export function MobileFAB({
  onClick,
  href = '/admin/skit-generator',
  icon = 'M12 4v16m8-8H4',
  label = 'Create',
}: MobileFABProps) {
  const Component = onClick ? 'button' : Link;
  const props = onClick ? { onClick } : { href };

  return (
    <Component
      {...(props as any)}
      className="fixed bottom-20 right-4 w-14 h-14 bg-violet-600 hover:bg-violet-500 text-white rounded-full shadow-lg shadow-violet-500/25 flex items-center justify-center z-40 md:hidden transition-transform active:scale-95"
      aria-label={label}
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
    </Component>
  );
}
