'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  FlaskConical,
  Trophy,
  FileText,
  Menu,
  X,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { ToastProvider } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { isNavItemActive } from '@/lib/navigation';

const BRAND_NAV = [
  { name: 'Dashboard', href: '/brand', icon: BarChart3 },
  { name: 'Creative Lab', href: '/brand/creative-lab', icon: FlaskConical },
  { name: 'Winners', href: '/brand/winners', icon: Trophy },
  { name: 'Reports', href: '/brand/reports', icon: FileText },
];

export default function BrandLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, authenticated, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !authenticated) {
      router.push('/login');
    }
  }, [loading, authenticated, router]);

  // Fetch brand membership
  useEffect(() => {
    if (!user?.id) return;
    fetch('/api/brand/my-brands')
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.data?.length) {
          setBrandId(data.data[0].id);
          setBrandName(data.data[0].name);
        }
      })
      .catch(() => {});
  }, [user?.id]);

  if (loading || !authenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-40 bg-zinc-900/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-zinc-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold">{brandName || 'Brand Portal'}</span>
          <div className="w-9" />
        </header>

        {/* Sidebar overlay (mobile) */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/60" />
          </div>
        )}

        {/* Sidebar */}
        <aside
          className={`fixed top-0 left-0 z-50 h-full w-64 bg-zinc-900 border-r border-white/10 transform transition-transform lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <div className="text-sm font-bold text-zinc-100">{brandName || 'Brand Portal'}</div>
              <div className="text-xs text-zinc-500">FlashFlow AI</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-zinc-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="px-3 py-4 space-y-1">
            {BRAND_NAV.map(item => {
              const active = isNavItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={brandId ? `${item.href}?brand_id=${brandId}` : item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-teal-500/10 text-teal-400'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User menu at bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-3 py-3 border-t border-white/10">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white rounded-lg hover:bg-white/5"
              >
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                  {user?.email?.[0]?.toUpperCase() || '?'}
                </div>
                <span className="flex-1 text-left truncate">{user?.email || 'User'}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-zinc-800 border border-white/10 rounded-lg overflow-hidden">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="lg:ml-64 min-h-screen">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
