'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { brandName, logoText } from '@/lib/brand';
import { EffectiveOrgBranding } from '@/lib/org-branding';

interface ClientNavProps {
  userName?: string;
  branding?: EffectiveOrgBranding | null;
}

const NAV_ITEMS = [
  { href: '/client', label: 'Home' },
  { href: '/client/requests', label: 'Requests' },
  { href: '/client/videos', label: 'Videos' },
  { href: '/client/projects', label: 'Projects' },
  { href: '/client/billing', label: 'Billing' },
  { href: '/client/support', label: 'Support' },
  { href: '/admin/status', label: 'Status' },
];

export default function ClientNav({ userName, branding }: ClientNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/client') {
      return pathname === '/client';
    }
    return pathname.startsWith(href);
  };

  // Apply branding or use defaults
  const displayName = branding?.org_display_name || brandName;
  const logoUrl = branding?.logo_url;
  const accentBg = branding?.accent_bg_class || 'bg-slate-800';
  const accentText = branding?.accent_text_class || 'text-slate-800';

  return (
    <nav className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        {/* Brand */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={displayName}
            className="h-8 w-auto object-contain flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className={`px-2 py-1 ${accentBg} text-white text-sm font-bold rounded flex-shrink-0`}>
            {logoText}
          </span>
        )}
        <span className={`text-lg font-semibold ${accentText} truncate`}>{displayName}</span>
        {userName && (
          <span className="text-sm text-slate-500 truncate hidden sm:inline">
            {userName}
          </span>
        )}
      </div>

      {/* Navigation Links — scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex items-center gap-1 min-w-max">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                isActive(item.href)
                  ? `${accentBg} text-white`
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Accent border using branding color */}
      <div className={`mt-3 h-0.5 ${accentBg} opacity-20`} />
    </nav>
  );
}
