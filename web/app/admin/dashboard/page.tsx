'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles, FileText, Video, Calendar, Trophy, BarChart3,
  Package, Folder, CreditCard, X, Settings
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/hooks/useCredits';
import { getDashboardRole } from '@/lib/dashboard-roles';
import SetupChecklist from './SetupChecklist';
import RetainerTracker from './RetainerTracker';
import { ActivityFeed } from './_components/ActivityFeed';
import { PerformanceSnapshot } from './_components/PerformanceSnapshot';
import { PersonalQueue } from './_components/PersonalQueue';
import { AdminPanel } from './_components/AdminPanel';
import { TeamPanel } from './_components/TeamPanel';
import { CreatorPanel } from './_components/CreatorPanel';

interface DashboardData {
  role: string;
  isAdmin: boolean;
  activityFeed: { id: string; type: 'pipeline' | 'user'; event: string; description: string; timestamp: string }[];
  performance: {
    postsThisWeek: number;
    viewsThisWeek: number;
    topVideo: { id: string; video_code: string; views_total: number; posted_url?: string } | null;
    upcomingPosts: {
      readyToPost: { id: string; video_code: string }[];
      scheduled: { id: string; title: string; scheduled_for: string; platform: string }[];
    };
    scriptsCount: number;
  };
  personalQueue: {
    needsApproval: { id: string; video_code: string; recording_status: string; created_at: string }[];
    needsEdits: { id: string; video_code: string; recording_status: string; created_at: string; edit_notes?: string }[];
    overdue: { id: string; video_code: string; recording_status: string; created_at: string }[];
  };
  pipeline?: {
    statusCounts: Record<string, number>;
    stuckVideos: { items: { id: string; video_code: string; recording_status: string; last_status_changed_at: string }[]; total: number };
    failures: { items: { id: string; video_id: string; event_type: string; details: Record<string, unknown>; created_at: string }[]; total: number };
  };
}

const ALL_QUICK_NAV_ITEMS = [
  { id: 'content-studio', label: 'Content Studio', href: '/admin/content-studio', icon: Sparkles, color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', description: 'Generate AI scripts' },
  { id: 'transcriber', label: 'Transcriber', href: '/admin/transcribe', icon: FileText, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', description: 'Transcribe videos' },
  { id: 'script-library', label: 'Script Library', href: '/admin/script-library', icon: Folder, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', description: 'Browse scripts' },
  { id: 'production-board', label: 'Production Board', href: '/admin/pipeline', icon: Video, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', description: 'Track production' },
  { id: 'retainers', label: 'Retainers', href: '/admin/retainers', icon: BarChart3, color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', description: 'Track retainers' },
  { id: 'winners-bank', label: 'Winners Bank', href: '/admin/winners', icon: Trophy, color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', description: 'Winning videos' },
  { id: 'analytics', label: 'Analytics', href: '/admin/analytics', icon: BarChart3, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', description: 'View insights' },
  { id: 'brands', label: 'Brands', href: '/admin/brands', icon: Package, color: 'bg-violet-500/20 text-violet-400 border-violet-500/30', description: 'Manage brands' },
];

const DEFAULT_QUICK_LINKS = ['content-studio', 'transcriber', 'script-library', 'production-board', 'retainers', 'winners-bank', 'analytics', 'brands'];

export default function DashboardPage() {
  const { user, role, isAdmin } = useAuth();
  const { credits } = useCredits();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [customizingQuickLinks, setCustomizingQuickLinks] = useState(false);
  const [selectedQuickLinks, setSelectedQuickLinks] = useState<string[]>(DEFAULT_QUICK_LINKS);

  const dashboardRole = getDashboardRole(role, isAdmin);

  // Load quick link preferences
  useEffect(() => {
    const saved = localStorage.getItem('flashflow_quick_links');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedQuickLinks(parsed.slice(0, 8));
        }
      } catch {
        // use defaults
      }
    }
  }, []);

  // Fetch aggregated dashboard data
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/admin/dashboard');
        if (res.ok) {
          const json = await res.json();
          if (json.ok) {
            setDashboardData(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const userName = user?.email?.split('@')[0] || '';

  const handleToggleQuickLink = (id: string) => {
    setSelectedQuickLinks(prev => {
      if (prev.includes(id)) return prev.filter(item => item !== id);
      if (prev.length < 8) return [...prev, id];
      return prev;
    });
  };

  const handleSaveQuickLinks = () => {
    localStorage.setItem('flashflow_quick_links', JSON.stringify(selectedQuickLinks));
    setCustomizingQuickLinks(false);
  };

  const displayedQuickLinks = ALL_QUICK_NAV_ITEMS.filter(item => selectedQuickLinks.includes(item.id));

  return (
    <div className="pt-6 pb-24 lg:pb-8 space-y-8 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">
          Welcome back{userName ? `, ${userName}` : ''}
        </h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">Here&apos;s what&apos;s happening with your content today</p>
      </div>

      {/* Setup Checklist */}
      <SetupChecklist scriptsCount={dashboardData?.performance.scriptsCount ?? 0} totalVideos={dashboardData?.performance.postsThisWeek ?? 0} />

      {/* Section 2 — Performance Snapshot */}
      <PerformanceSnapshot data={dashboardData?.performance ?? null} loading={loading} />

      {/* Section 1 — Activity Feed + Section 3 — Personal Queue (side by side on desktop) */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ActivityFeed items={dashboardData?.activityFeed ?? []} loading={loading} />
        <PersonalQueue data={dashboardData?.personalQueue ?? null} loading={loading} />
      </div>

      {/* Section 4 — Role-Specific Panel */}
      {dashboardRole === 'admin' && dashboardData?.pipeline && (
        <AdminPanel pipeline={dashboardData.pipeline} />
      )}
      {dashboardRole === 'team' && (
        <TeamPanel
          scriptsCount={dashboardData?.performance.scriptsCount ?? 0}
          personalQueue={dashboardData?.personalQueue ?? null}
        />
      )}
      {dashboardRole === 'creator' && (
        <CreatorPanel
          scriptsCount={dashboardData?.performance.scriptsCount ?? 0}
          viewsThisWeek={dashboardData?.performance.viewsThisWeek ?? 0}
          postsThisWeek={dashboardData?.performance.postsThisWeek ?? 0}
        />
      )}

      {/* Retainer Tracker */}
      <RetainerTracker />

      {/* Quick Nav Grid */}
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[var(--text)]">Quick Actions</h2>
          <button
            onClick={() => setCustomizingQuickLinks(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] bg-[var(--surface)] hover:bg-[var(--surface2)] rounded-lg transition-colors"
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
                className={`group bg-[var(--surface)] border ${item.color} rounded-xl p-4 md:p-6 hover:scale-[1.02] transition-all duration-200 active:scale-[0.98] min-h-[80px] md:min-h-0`}
              >
                <div className="flex flex-col items-start gap-2 md:gap-3">
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg ${item.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--text)] group-hover:text-teal-400 transition-colors text-sm md:text-base">
                      {item.label}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 hidden sm:block">{item.description}</p>
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
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">Customize Quick Actions</h3>
              <button
                onClick={() => setCustomizingQuickLinks(false)}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)] rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-[var(--text-muted)] mb-4">
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
                        ? 'bg-teal-500/10 border-teal-500/30 text-[var(--text)]'
                        : 'bg-[var(--surface2)]/50 border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface2)] hover:text-[var(--text)]'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-[var(--text-muted)]">{item.description}</p>
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
            <div className="sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border)] p-4">
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
    </div>
  );
}
