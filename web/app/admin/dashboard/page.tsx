'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles, FileText, Video, Calendar, Trophy, BarChart3,
  Package, Folder, CreditCard, X
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/hooks/useCredits';

interface DashboardStats {
  scriptsCount: number;
  activeBrands: number;
}

const QUICK_NAV_ITEMS = [
  {
    label: 'Content Studio',
    href: '/admin/content-studio',
    icon: Sparkles,
    color: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    description: 'Generate AI scripts',
  },
  {
    label: 'Transcriber',
    href: '/admin/transcriber',
    icon: FileText,
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    description: 'Transcribe videos',
  },
  {
    label: 'Script Library',
    href: '/admin/script-library',
    icon: Folder,
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    description: 'Browse scripts',
  },
  {
    label: 'Production Board',
    href: '/admin/pipeline',
    icon: Video,
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    description: 'Track production',
  },
  {
    label: 'Content Calendar',
    href: '/admin/calendar',
    icon: Calendar,
    color: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    description: 'Plan schedule',
  },
  {
    label: 'Winners Bank',
    href: '/admin/winners',
    icon: Trophy,
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    description: 'Winning videos',
  },
  {
    label: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    description: 'View insights',
  },
  {
    label: 'Brands',
    href: '/admin/brands',
    icon: Package,
    color: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    description: 'Manage brands',
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { credits } = useCredits();
  const [stats, setStats] = useState<DashboardStats>({ scriptsCount: 0, activeBrands: 0 });
  const [loading, setLoading] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Check if onboarding was dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('flashflow_onboarding_dismissed');
    if (dismissed === 'true') {
      setOnboardingDismissed(true);
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch scripts count
        const scriptsRes = await fetch('/api/scripts?limit=1');
        let scriptsCount = 0;
        if (scriptsRes.ok) {
          const scriptsData = await scriptsRes.json();
          scriptsCount = scriptsData.meta?.total || 0;
        }

        // Fetch brands count
        const brandsRes = await fetch('/api/brands');
        let activeBrands = 0;
        if (brandsRes.ok) {
          const brandsData = await brandsRes.json();
          activeBrands = brandsData.data?.length || 0;
        }

        setStats({ scriptsCount, activeBrands });
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const userName = user?.email?.split('@')[0] || '';

  const handleDismissOnboarding = () => {
    localStorage.setItem('flashflow_onboarding_dismissed', 'true');
    setOnboardingDismissed(true);
  };

  // Show onboarding if: not loading, not dismissed, AND (no brands OR no scripts)
  const showOnboarding = !loading && !onboardingDismissed && (stats.scriptsCount === 0 || stats.activeBrands === 0);

  return (
    <div className="pt-6 pb-24 lg:pb-8 space-y-8 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Welcome back{userName ? `, ${userName}` : ''}
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Here's what's happening with your content today</p>
      </div>

      {/* Onboarding Card - Show when user has 0 brands OR 0 scripts, dismissable */}
      {showOnboarding && (
        <div className="bg-gradient-to-r from-teal-500/10 via-blue-500/10 to-purple-500/10 border border-teal-500/20 rounded-xl p-6 relative">
          <button
            onClick={handleDismissOnboarding}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-colors"
            aria-label="Dismiss onboarding"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-4">
            <Sparkles className="w-6 h-6 text-teal-400 shrink-0 mt-1" />
            <div className="flex-1 pr-8">
              <h3 className="text-xl font-bold text-white mb-2">Welcome! Get started in 3 steps:</h3>
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 font-bold flex-shrink-0">
                    1
                  </div>
                  <div className="flex-1 flex items-center justify-between gap-4">
                    <span className="text-zinc-200">Add Your First Brand</span>
                    <Link
                      href="/admin/brands"
                      className="px-4 py-2 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors whitespace-nowrap"
                    >
                      Create Brand
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold flex-shrink-0">
                    2
                  </div>
                  <div className="flex-1 flex items-center justify-between gap-4">
                    <span className="text-zinc-200">Generate a Script</span>
                    <Link
                      href="/admin/content-studio"
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors whitespace-nowrap"
                    >
                      Content Studio
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold flex-shrink-0">
                    3
                  </div>
                  <div className="flex-1 flex items-center justify-between gap-4">
                    <span className="text-zinc-200">Try the Transcriber</span>
                    <Link
                      href="/admin/transcribe"
                      className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors whitespace-nowrap"
                    >
                      Open Transcriber
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Credits Remaining */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <div className="text-sm text-zinc-400">Credits Remaining</div>
              <div className="text-2xl font-bold text-white">
                {loading ? '—' : credits?.remaining ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Scripts Generated */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-sm text-zinc-400">Scripts Generated</div>
              <div className="text-2xl font-bold text-white">
                {loading ? '—' : stats.scriptsCount}
              </div>
            </div>
          </div>
        </div>

        {/* Active Brands */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-sm text-zinc-400">Active Brands</div>
              <div className="text-2xl font-bold text-white">
                {loading ? '—' : stats.activeBrands}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Nav Grid */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group bg-zinc-900 border ${item.color} rounded-xl p-6 hover:scale-[1.02] transition-all duration-200 active:scale-[0.98]`}
              >
                <div className="flex flex-col items-start gap-3">
                  <div className={`w-12 h-12 rounded-lg ${item.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-teal-400 transition-colors">
                      {item.label}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Getting Started Tip */}
      <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">New to FlashFlow?</h3>
            <p className="text-sm text-zinc-300">
              Start by generating your first script in the <Link href="/admin/content-studio" className="text-teal-400 hover:text-teal-300 underline">Content Studio</Link>,
              or browse winning content in the <Link href="/admin/winners" className="text-teal-400 hover:text-teal-300 underline">Winners Bank</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
