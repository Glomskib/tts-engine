'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ClientNavProps {
  userName?: string;
}

const NAV_ITEMS = [
  { href: '/client', label: 'Home' },
  { href: '/client/videos', label: 'Videos' },
  { href: '/client/support', label: 'Support' },
  { href: '/admin/status', label: 'Status' },
];

export default function ClientNav({ userName }: ClientNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/client') {
      return pathname === '/client';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="mb-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-slate-800">Client Portal</span>
          {userName && (
            <span className="text-sm text-slate-500">
              {userName}
            </span>
          )}
        </div>

        {/* Navigation Links */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive(item.href)
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="mt-4 border-b border-slate-200" />
    </nav>
  );
}
