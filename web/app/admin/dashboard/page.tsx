'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles, FileText, Video, Calendar, Trophy, BarChart3,
  Package, Folder, CreditCard, X, Settings, Target, TrendingUp
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/hooks/useCredits';

interface DashboardStats {
  scriptsCount: number;
  activeBrands: number;
}

const ALL_QUICK_NAV_ITEMS = [
  {
    id: 'content-studio',
    label: 'Content Studio',
    href: '/admin/content-studio',
    icon: Sparkles,
    color: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    description: 'Generate AI scripts',
  },
  {
    id: 'transcriber',
    label: 'Transcriber',
    href: '/admin/transcribe',
    icon: FileText,
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    description: 'Transcribe videos',
  },
  {
    id: 'script-library',
    label: 'Script Library',
    href: '/admin/script-library',
    icon: Folder,
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    description: 'Browse scripts',
  },
  {
    id: 'production-board',
    label: 'Production Board',
    href: '/admin/pipeline',
    icon: Video,
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    description: 'Track production',
  },
  {
    id: 'retainers',
    label: 'Retainers',
    href: '/admin/retainers',
    icon: Target,
    color: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    description: 'Track retainers',
  },
  {
    id: 'winners-bank',
    label: 'Winners Bank',
    href: '/admin/winners',
    icon: Trophy,
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    description: 'Winning videos',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    description: 'View insights',
  },
  {
    id: 'brands',
    label: 'Brands',
    href: '/admin/brands',
    icon: Package,
    color: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    description: 'Manage brands',
  },
];

const DEFAULT_QUICK_LINKS = ['content-studio', 'transcriber', 'script-library', 'production-board', 'retainers', 'winners-bank', 'analytics', 'brands'];

export default function DashboardPage() {
  const { user } = useAuth();
  const { credits } = useCredits();
  const [stats, setStats] = useState<DashboardStats>({ scriptsCount: 0, activeBrands: 0 });
  const [loading, setLoading] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [customizingQuickLinks, setCustomizingQuickLinks] = useState(false);
  const [selectedQuickLinks, setSelectedQuickLinks] = useState<string[]>(DEFAULT_QUICK_LINKS);
  const [incomeGoal, setIncomeGoal] = useState(5000);
  const [videosGoal, setVideosGoal] = useState(50);
  const [currentIncome, setCurrentIncome] = useState(0);
  const [currentVideos, setCurrentVideos] = useState(0);
  const [editingGoals, setEditingGoals] = useState(false);
  const [autoCalcVideos, setAutoCalcVideos] = useState<number | null>(null);
  const [autoCalcIncome, setAutoCalcIncome] = useState<number | null>(null);
  const [goalsOverridden, setGoalsOverridden] = useState(false);

  // Check if onboarding was dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('flashflow_onboarding_dismissed');
    if (dismissed === 'true') {
      setOnboardingDismissed(true);
    }

    // Load saved quick links
    const saved = localStorage.getItem('flashflow_quick_links');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedQuickLinks(parsed.slice(0, 8)); // Max 8 items
        }
      } catch (e) {
        // Invalid JSON, use defaults
      }
    }

    // Load saved monthly goals (user overrides)
    const savedGoals = localStorage.getItem('flashflow_monthly_goals');
    if (savedGoals) {
      try {
        const parsed = JSON.parse(savedGoals);
        if (parsed.incomeGoal) setIncomeGoal(parsed.incomeGoal);
        if (parsed.videosGoal) setVideosGoal(parsed.videosGoal);
        if (parsed.overridden) setGoalsOverridden(true);
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }, []);

  // Auto-calculate goals from brand quotas + retainer targets
  useEffect(() => {
    const fetchAutoCalc = async () => {
      try {
        // Fetch brand quotas
        const brandsRes = await fetch('/api/brands');
        let totalQuotaVideos = 0;
        if (brandsRes.ok) {
          const brandsData = await brandsRes.json();
          totalQuotaVideos = (brandsData.data || []).reduce((sum: number, b: { monthly_video_quota?: number }) => sum + (b.monthly_video_quota || 0), 0);
        }

        // Fetch retainer targets
        const retainersRes = await fetch('/api/admin/retainers', { credentials: 'include' });
        let retainerVideos = 0;
        let retainerIncome = 0;
        if (retainersRes.ok) {
          const retainerData = await retainersRes.json();
          if (retainerData.summary) {
            retainerVideos = retainerData.summary.total_videos_needed || 0;
            retainerIncome = (retainerData.summary.total_base || 0) + (retainerData.summary.total_potential || 0);
          }
        }

        const calcVideos = Math.max(totalQuotaVideos, retainerVideos);
        setAutoCalcVideos(calcVideos);
        setAutoCalcIncome(retainerIncome);

        // If not overridden, use auto-calculated values
        if (!localStorage.getItem('flashflow_monthly_goals') || !JSON.parse(localStorage.getItem('flashflow_monthly_goals') || '{}').overridden) {
          if (calcVideos > 0) setVideosGoal(calcVideos);
          if (retainerIncome > 0) setIncomeGoal(retainerIncome);
        }
      } catch {
        // Silent fail — keep manual goals
      }
    };
    fetchAutoCalc();
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

        // Fetch current month's income from analytics
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const daysSinceMonthStart = Math.ceil((now.getTime() - firstDayOfMonth.getTime()) / (1000 * 60 * 60 * 24));
        const revenueRes = await fetch(`/api/analytics?type=revenue&days=${daysSinceMonthStart}`);
        let monthlyIncome = 0;
        if (revenueRes.ok) {
          const revenueData = await revenueRes.json();
          monthlyIncome = revenueData.data?.reduce((sum: number, item: any) => sum + (item.revenue || 0), 0) || 0;
        }

        // Fetch current month's video count
        const videosRes = await fetch('/api/videos');
        let monthlyVideos = 0;
        if (videosRes.ok) {
          const videosData = await videosRes.json();
          const monthStart = firstDayOfMonth.toISOString();
          monthlyVideos = videosData.data?.filter((v: any) => v.created_at >= monthStart).length || 0;
        }

        setStats({ scriptsCount, activeBrands });
        setCurrentIncome(monthlyIncome);
        setCurrentVideos(monthlyVideos);
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

  const handleToggleQuickLink = (id: string) => {
    setSelectedQuickLinks(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else if (prev.length < 8) {
        return [...prev, id];
      }
      return prev;
    });
  };

  const handleSaveQuickLinks = () => {
    localStorage.setItem('flashflow_quick_links', JSON.stringify(selectedQuickLinks));
    setCustomizingQuickLinks(false);
  };

  const handleSaveGoals = () => {
    localStorage.setItem('flashflow_monthly_goals', JSON.stringify({ incomeGoal, videosGoal, overridden: true }));
    setGoalsOverridden(true);
    setEditingGoals(false);
  };

  const handleResetToAuto = () => {
    if (autoCalcVideos !== null && autoCalcVideos > 0) setVideosGoal(autoCalcVideos);
    if (autoCalcIncome !== null && autoCalcIncome > 0) setIncomeGoal(autoCalcIncome);
    setGoalsOverridden(false);
    localStorage.removeItem('flashflow_monthly_goals');
    setEditingGoals(false);
  };

  // Show onboarding if: not loading, not dismissed, AND (no brands OR no scripts)
  const showOnboarding = !loading && !onboardingDismissed && (stats.scriptsCount === 0 || stats.activeBrands === 0);

  const displayedQuickLinks = ALL_QUICK_NAV_ITEMS.filter(item => selectedQuickLinks.includes(item.id));

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

      {/* Monthly Goals Widget */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Monthly Goals</h2>
            {autoCalcVideos !== null && autoCalcVideos > 0 && !goalsOverridden && (
              <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                Auto-calculated: {autoCalcVideos} videos needed
              </span>
            )}
            {goalsOverridden && (
              <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
                Custom override
              </span>
            )}
          </div>
          <button
            onClick={() => setEditingGoals(true)}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Edit Goals
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Income Goal */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Income Goal</span>
              <span className="text-sm font-semibold text-white">
                ${currentIncome.toLocaleString()} / ${incomeGoal.toLocaleString()}
              </span>
            </div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min((currentIncome / incomeGoal) * 100, 100)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {Math.round((currentIncome / incomeGoal) * 100)}% complete
            </div>
          </div>

          {/* Videos Goal */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Videos Goal</span>
              <span className="text-sm font-semibold text-white">
                {currentVideos} / {videosGoal}
              </span>
            </div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min((currentVideos / videosGoal) * 100, 100)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {Math.round((currentVideos / videosGoal) * 100)}% complete
            </div>
          </div>
        </div>

        {/* Accountability Text */}
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-400">
              {currentIncome >= incomeGoal && currentVideos >= videosGoal
                ? 'Amazing work! You have crushed your monthly goals!'
                : currentIncome >= incomeGoal * 0.8 || currentVideos >= videosGoal * 0.8
                ? 'You are on track! Keep up the momentum to hit your goals.'
                : 'Stay focused! Consistency is the key to achieving your targets.'}
            </p>
          </div>
        </div>
      </div>

      {/* Edit Goals Modal */}
      {editingGoals && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 max-w-md w-full">
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Edit Monthly Goals</h3>
              <button
                onClick={() => setEditingGoals(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Income Goal Input */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Income Goal ($)
                </label>
                <input
                  type="number"
                  value={incomeGoal}
                  onChange={(e) => setIncomeGoal(Math.max(0, Number(e.target.value)))}
                  min="0"
                  step="100"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-teal-500 focus:outline-none"
                />
              </div>

              {/* Videos Goal Input */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Videos Goal
                </label>
                <input
                  type="number"
                  value={videosGoal}
                  onChange={(e) => setVideosGoal(Math.max(0, Number(e.target.value)))}
                  min="0"
                  step="1"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-4 space-y-2">
              <button
                onClick={handleSaveGoals}
                className="w-full py-3 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors"
              >
                Save Goals
              </button>
              {autoCalcVideos !== null && autoCalcVideos > 0 && (
                <button
                  onClick={handleResetToAuto}
                  className="w-full py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Reset to auto-calculated ({autoCalcVideos} videos, ${autoCalcIncome?.toLocaleString() || '0'})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Nav Grid */}
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Quick Actions</h2>
          <button
            onClick={() => setCustomizingQuickLinks(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Customize</span>
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {displayedQuickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group bg-zinc-900 border ${item.color} rounded-xl p-4 md:p-6 hover:scale-[1.02] transition-all duration-200 active:scale-[0.98] min-h-[80px] md:min-h-0`}
              >
                <div className="flex flex-col items-start gap-2 md:gap-3">
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg ${item.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-teal-400 transition-colors text-sm md:text-base">
                      {item.label}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5 hidden sm:block">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Customize Quick Links Modal */}
      {customizingQuickLinks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Customize Quick Actions</h3>
              <button
                onClick={() => setCustomizingQuickLinks(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-zinc-400 mb-4">
                Select up to 8 items to display. Selected items: {selectedQuickLinks.length}/8
              </p>
              {ALL_QUICK_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isSelected = selectedQuickLinks.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleToggleQuickLink(item.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-teal-500/10 border-teal-500/30 text-white'
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-zinc-500">{item.description}</p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-4">
              <button
                onClick={handleSaveQuickLinks}
                className="w-full py-3 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

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
