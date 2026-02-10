'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCredits } from '@/hooks/useCredits';

interface DashboardStats {
  totalSkits: number;
  draftSkits: number;
  approvedSkits: number;
  producedSkits: number;
}

interface RecentSkit {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

interface ActivityItem {
  id: string;
  action: string;
  entity_type: string;
  entity_name: string | null;
  created_at: string;
}

const quickAccessCards = [
  {
    title: 'Script Generator',
    description: 'Create AI-powered video scripts',
    href: '/admin/skit-generator',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    title: 'Script Library',
    description: 'View and manage saved scripts',
    href: '/admin/skit-library',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    title: 'Audience',
    description: 'Personas and pain points',
    href: '/admin/audience',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    title: 'Winners Bank',
    description: 'Analyze successful videos',
    href: '/admin/winners',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
    gradient: 'from-green-500 to-emerald-600',
  },
];

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'draft': return 'bg-zinc-600';
    case 'approved': return 'bg-blue-600';
    case 'produced': return 'bg-violet-600';
    case 'posted': return 'bg-green-600';
    case 'archived': return 'bg-zinc-700';
    default: return 'bg-zinc-600';
  }
}

export default function AdminDashboard() {
  const { credits, subscription, isLoading: creditsLoading } = useCredits();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSkits, setRecentSkits] = useState<RecentSkit[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch skits for stats
        const res = await fetch('/api/skits?limit=100');
        if (res.ok) {
          const data = await res.json();
          const skits = data.data || [];

          // Calculate stats
          const statsObj: DashboardStats = {
            totalSkits: data.pagination?.total || skits.length,
            draftSkits: skits.filter((s: RecentSkit) => s.status === 'draft').length,
            approvedSkits: skits.filter((s: RecentSkit) => s.status === 'approved').length,
            producedSkits: skits.filter((s: RecentSkit) => s.status === 'produced' || s.status === 'posted').length,
          };
          setStats(statsObj);

          // Get 5 most recent
          setRecentSkits(skits.slice(0, 5));
        }

        // Check if onboarding is needed
        const onboardingDone = localStorage.getItem('ff-onboarding-completed');
        const onboardingDismissed = localStorage.getItem('ff-onboarding-dismissed');
        if (!onboardingDismissed) {
          const completed = onboardingDone ? JSON.parse(onboardingDone) : [];
          if (completed.length < 5) {
            setShowOnboarding(true);
          }
        }

        // Fetch recent activity
        const actRes = await fetch('/api/activity?limit=8');
        if (actRes.ok) {
          const actData = await actRes.json();
          setRecentActivity(actData.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const isUnlimited = credits?.remaining === -1 || (credits as { isUnlimited?: boolean })?.isUnlimited;
  const creditsDisplay = isUnlimited ? 'Unlimited' : (credits?.remaining ?? '—');

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Image
              src="/FFAI.png"
              alt="FlashFlow AI"
              width={48}
              height={48}
              className="rounded-xl"
            />
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">
                Welcome to FlashFlow AI
              </h1>
              <p className="text-zinc-400">
                Create engaging video scripts with AI
              </p>
            </div>
          </div>
        </div>

        {/* Onboarding CTA */}
        {showOnboarding && (
          <div className="mb-6 p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-400">New here? Get started in 5 easy steps</p>
              <p className="text-xs text-zinc-500 mt-0.5">Set up products, generate scripts, and track winners.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/admin/onboarding"
                className="px-3 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Start Setup
              </Link>
              <button
                onClick={() => {
                  setShowOnboarding(false);
                  localStorage.setItem('ff-onboarding-dismissed', 'true');
                }}
                className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Credits */}
          <div className={`p-5 rounded-xl border ${
            isUnlimited
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-zinc-900/50 border-white/10'
          }`}>
            <div className="text-sm text-zinc-400 mb-1">Credits</div>
            <div className={`text-2xl font-bold ${isUnlimited ? 'text-emerald-400' : 'text-white'}`}>
              {creditsLoading ? '—' : creditsDisplay}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {subscription?.planName || 'Free'} plan
            </div>
          </div>

          {/* Total Scripts */}
          <div className="p-5 rounded-xl border border-white/10 bg-zinc-900/50">
            <div className="text-sm text-zinc-400 mb-1">Total Scripts</div>
            <div className="text-2xl font-bold text-white">
              {loading ? '—' : stats?.totalSkits ?? 0}
            </div>
            <div className="text-xs text-zinc-500 mt-1">saved to library</div>
          </div>

          {/* Drafts */}
          <div className="p-5 rounded-xl border border-white/10 bg-zinc-900/50">
            <div className="text-sm text-zinc-400 mb-1">Drafts</div>
            <div className="text-2xl font-bold text-white">
              {loading ? '—' : stats?.draftSkits ?? 0}
            </div>
            <div className="text-xs text-zinc-500 mt-1">in progress</div>
          </div>

          {/* Produced */}
          <div className="p-5 rounded-xl border border-white/10 bg-zinc-900/50">
            <div className="text-sm text-zinc-400 mb-1">Produced</div>
            <div className="text-2xl font-bold text-white">
              {loading ? '—' : stats?.producedSkits ?? 0}
            </div>
            <div className="text-xs text-zinc-500 mt-1">videos created</div>
          </div>
        </div>

        {/* Quick Access */}
        <h2 className="text-lg font-semibold text-white mb-4">Quick Access</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {quickAccessCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group p-5 rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-zinc-800/50 transition-all"
            >
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-3 text-white group-hover:scale-110 transition-transform`}>
                {card.icon}
              </div>
              <div className="text-white font-medium mb-1">{card.title}</div>
              <div className="text-sm text-zinc-500">{card.description}</div>
            </Link>
          ))}
        </div>

        {/* Recent Scripts */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Scripts</h2>
          {recentSkits.length > 0 && (
            <Link
              href="/admin/skit-library"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              View all →
            </Link>
          )}
        </div>

        {loading ? (
          <div className="p-8 rounded-xl border border-white/10 bg-zinc-900/30 text-center text-zinc-500">
            Loading...
          </div>
        ) : recentSkits.length === 0 ? (
          <div className="p-8 rounded-xl border border-white/10 bg-zinc-900/30 text-center">
            <div className="text-zinc-500 mb-4">No scripts yet</div>
            <Link
              href="/admin/skit-generator"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-zinc-900 rounded-lg font-medium hover:bg-zinc-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create your first script
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-zinc-900/30 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Title</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase hidden sm:table-cell">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentSkits.map((skit, index) => (
                  <tr
                    key={skit.id}
                    className={`hover:bg-zinc-800/30 transition-colors ${
                      index !== recentSkits.length - 1 ? 'border-b border-white/5' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <Link
                        href={`/admin/skit-library`}
                        className="text-zinc-200 hover:text-white transition-colors"
                      >
                        {skit.title}
                      </Link>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${getStatusColor(skit.status)} text-white`}>
                        {skit.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-zinc-500">
                      {formatTimeAgo(skit.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent Activity */}
        <div className="flex items-center justify-between mb-4 mt-8">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          <Link href="/admin/activity" className="text-sm text-zinc-400 hover:text-white transition-colors">
            View all →
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/30 text-center text-zinc-500 text-sm">
            No recent activity
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-zinc-900/30 divide-y divide-white/5">
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-zinc-300">{item.action.replace(/_/g, ' ')}</span>
                  {item.entity_name && (
                    <span className="text-sm text-zinc-500 ml-1">— {item.entity_name}</span>
                  )}
                </div>
                <span className="text-xs text-zinc-600 flex-shrink-0">{formatTimeAgo(item.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Low Credits Warning */}
        {!isUnlimited && credits && credits.remaining <= 2 && credits.remaining > 0 && (
          <div className="mt-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <div className="text-sm font-medium text-amber-400">Low credits</div>
                <div className="text-sm text-zinc-400 mt-0.5">
                  You have {credits.remaining} credit{credits.remaining !== 1 ? 's' : ''} remaining.{' '}
                  <Link href="/upgrade" className="text-amber-400 hover:underline">
                    Upgrade your plan
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Zero Credits */}
        {!isUnlimited && credits && credits.remaining === 0 && (
          <div className="mt-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="text-sm font-medium text-red-400">No credits remaining</div>
                <div className="text-sm text-zinc-400 mt-0.5">
                  <Link href="/upgrade" className="text-red-400 hover:underline">
                    Upgrade your plan
                  </Link>{' '}
                  to continue generating scripts.
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
