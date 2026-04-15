'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { ActionCenter } from '@/components/dashboard/ActionCenter';
import { PipelineOverview } from '@/components/dashboard/PipelineOverview';
import { TodayAssignments } from '@/components/dashboard/TodayAssignments';
import { WinnersPanel } from '@/components/dashboard/WinnersPanel';
import { QuickTools } from '@/components/dashboard/QuickTools';
import { UsageMeter } from '@/components/dashboard/UsageMeter';
import { FileText, Rocket, Video, Sparkles, Package, Trophy, ArrowRight, CheckCircle2 } from 'lucide-react';

interface DashboardData {
  nextActions: Array<{
    action: string;
    video: { id: string; title: string; product: string | null; status: string };
  }>;
  pipelineCounts: {
    draft: number;
    needs_edit: number;
    ready_to_post: number;
    posted: number;
    failed: number;
    total: number;
    recording: { not_recorded: number; recorded: number; ai_rendering: number; edited: number };
    posted_this_week: number;
  };
  todayAssignments: Array<{
    id: string;
    title: string;
    product: string | null;
    brand: string | null;
    status: string;
    recording_status: string | null;
    nextAction: string;
  }>;
  winners: Array<{
    id: string;
    hook: string | null;
    view_count: number | null;
    content_format: string | null;
    product_category: string | null;
  }>;
  scriptsCount?: number;
  campaignsCount?: number;
}

const START_STEPS = [
  {
    num: 1,
    label: 'Add a product',
    desc: "Tell FlashFlow what you're promoting",
    href: '/admin/products',
    icon: Package,
    color: 'text-blue-400',
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/5',
  },
  {
    num: 2,
    label: 'Write your first script',
    desc: 'Pick a persona. Get a script in 30 seconds.',
    href: '/admin/content-studio',
    icon: Sparkles,
    color: 'text-teal-400',
    border: 'border-teal-500/20',
    bg: 'bg-teal-500/5',
  },
  {
    num: 3,
    label: 'See top ideas',
    desc: 'Find hooks that are working right now.',
    href: '/admin/intelligence/winners-bank',
    icon: Trophy,
    color: 'text-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/5',
  },
];

function StartHerePanel() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('ff-start-dismissed')) setDismissed(true);
  }, []);

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 border border-teal-500/20 rounded-2xl p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-xs text-teal-400 font-medium uppercase tracking-wide">Getting started</span>
          </div>
          <h2 className="text-lg font-bold text-white">Start here — 3 quick steps</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Most creators post their first video within 10 minutes.</p>
        </div>
        <button
          onClick={() => {
            localStorage.setItem('ff-start-dismissed', '1');
            setDismissed(true);
          }}
          className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors mt-1"
        >
          Dismiss
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {START_STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.num}
              href={step.href}
              className={`group flex flex-col gap-2 p-4 rounded-xl ${step.bg} border ${step.border} hover:scale-[1.02] transition-all`}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-400">
                  {step.num}
                </span>
                <Icon className={`w-4 h-4 ${step.color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{step.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{step.desc}</p>
              </div>
              <div className={`flex items-center gap-1 text-xs ${step.color} mt-auto`}>
                Start <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/dashboard');
        const json = await res.json();
        if (json.ok) {
          setData(json);
          setError(null);
        } else {
          setError(json.error || 'Failed to load dashboard');
        }
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const userName = user?.email?.split('@')[0] || '';

  if (loading) {
    return (
      <div className="pt-6 pb-24 lg:pb-8 max-w-5xl mx-auto px-4 space-y-6">
        <div>
          <div className="h-8 w-64 bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-48 bg-zinc-800/50 rounded mt-2 animate-pulse" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-zinc-900/50 border border-white/10 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-6 pb-24 lg:pb-8 max-w-5xl mx-auto px-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => { setLoading(true); setError(null); window.location.reload(); }}
            className="mt-3 px-4 py-2 min-h-[44px] bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const scriptsCount = data.scriptsCount ?? 0;
  const campaignsCount = data.campaignsCount ?? 0;
  const submissionsCount = data.pipelineCounts?.posted ?? 0;
  const isNewUser = scriptsCount === 0 && (data.pipelineCounts?.total ?? 0) === 0;

  // Greeting: new user gets welcome, returning user gets a friendly nudge
  const greeting = isNewUser
    ? (userName ? `Welcome, ${userName} 👋` : 'Welcome to FlashFlow 👋')
    : (userName ? `Hey ${userName} — let's keep it moving` : "Let's keep it moving");

  const subtext = isNewUser
    ? "You're all set. Let's get your first video out the door."
    : "Here's what needs your attention today.";

  return (
    <div className="pt-6 pb-24 lg:pb-8 max-w-5xl mx-auto px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{greeting}</h1>
        <p className="text-zinc-500 text-sm mt-1">{subtext}</p>
      </div>

      {/* New user: Start Here panel */}
      {isNewUser && <StartHerePanel />}

      {/* Key Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/admin/scripts"
          className="bg-zinc-900/60 border border-white/5 rounded-xl p-4 hover:border-violet-500/30 transition-colors group"
        >
          <FileText className="w-4 h-4 text-violet-400 mb-1" />
          <p className="text-2xl font-bold text-white tabular-nums">{scriptsCount}</p>
          <p className="text-xs text-zinc-500 group-hover:text-zinc-400">Scripts written</p>
        </Link>
        <Link
          href="/admin/campaigns"
          className="bg-zinc-900/60 border border-white/5 rounded-xl p-4 hover:border-teal-500/30 transition-colors group"
        >
          <Rocket className="w-4 h-4 text-teal-400 mb-1" />
          <p className="text-2xl font-bold text-white tabular-nums">{campaignsCount}</p>
          <p className="text-xs text-zinc-500 group-hover:text-zinc-400">Content plans</p>
        </Link>
        <Link
          href="/admin/pipeline?status=posted"
          className="bg-zinc-900/60 border border-white/5 rounded-xl p-4 hover:border-emerald-500/30 transition-colors group"
        >
          <Video className="w-4 h-4 text-emerald-400 mb-1" />
          <p className="text-2xl font-bold text-white tabular-nums">{submissionsCount}</p>
          <p className="text-xs text-zinc-500 group-hover:text-zinc-400">Videos posted</p>
        </Link>
      </div>

      {/* 1. Next moves for the user */}
      <ActionCenter actions={data.nextActions} />

      {/* 2. Where the user's videos are right now */}
      <PipelineOverview counts={data.pipelineCounts} />

      {/* 3. What's up next today */}
      <TodayAssignments assignments={data.todayAssignments} />

      {/* 4. Top ideas worth copying */}
      <WinnersPanel winners={data.winners} />

      {/* 5. Shortcuts */}
      <QuickTools />

      {/* 6. Plan usage */}
      <UsageMeter />
    </div>
  );
}
