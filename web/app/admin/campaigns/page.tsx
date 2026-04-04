'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Rocket, Plus, Loader2, RefreshCw,
  CheckCircle, Clock, AlertTriangle, Play, Zap,
  FileText, LayoutList, ChevronRight,
} from 'lucide-react';
import AdminPageLayout, { AdminCard, EmptyState } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';

interface Campaign {
  id: string;
  name: string;
  status: string;
  hook_count: number;
  winner_count: number;
  created_at: string;
  brand_name: string | null;
  product_name: string | null;
  platform: string | null;
  generation_status: string | null;
  hooks_generated: number;
  scripts_generated: number;
  items_created: number;
  personas: number;
  angles: number;
}

const GEN_STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
  pending: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', icon: <Clock className="w-3 h-3" />, label: 'Pending' },
  generating_hooks: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'Generating Hooks' },
  generating_scripts: { bg: 'bg-violet-500/10', text: 'text-violet-400', icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'Generating Scripts' },
  creating_items: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'Creating Content' },
  completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: <CheckCircle className="w-3 h-3" />, label: 'Completed' },
  partial: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: <AlertTriangle className="w-3 h-3" />, label: 'Partial' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400', icon: <AlertTriangle className="w-3 h-3" />, label: 'Failed' },
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram_reels: 'Instagram Reels',
  youtube_shorts: 'YouTube Shorts',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export default function CampaignsPage() {
  const { showError } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns', { credentials: 'include' });
      const json = await res.json();
      if (json.ok) {
        setCampaigns(json.data || []);
      } else {
        showError('Failed to load campaigns');
      }
    } catch {
      showError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const completed = campaigns.filter(c => c.generation_status === 'completed').length;
  const inProgress = campaigns.filter(c =>
    c.generation_status && !['completed', 'failed', 'pending'].includes(c.generation_status)
  ).length;
  const totalScripts = campaigns.reduce((sum, c) => sum + (c.scripts_generated || 0), 0);

  return (
    <AdminPageLayout
      title="Campaigns"
      subtitle="AI-powered content generation campaigns"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/admin/campaigns/new"
            className="inline-flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </Link>
        </div>
      }
    >
      {/* Stats row */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Campaigns', value: campaigns.length, icon: <Rocket className="w-4 h-4" />, color: 'text-teal-400' },
            { label: 'Completed', value: completed, icon: <CheckCircle className="w-4 h-4" />, color: 'text-emerald-400' },
            { label: 'In Progress', value: inProgress, icon: <Play className="w-4 h-4" />, color: 'text-blue-400' },
            { label: 'Scripts Made', value: totalScripts, icon: <FileText className="w-4 h-4" />, color: 'text-violet-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-zinc-900/60 border border-white/5 rounded-xl p-4">
              <div className={`${stat.color} mb-1`}>{stat.icon}</div>
              <div className="text-xl font-bold text-white tabular-nums">{stat.value}</div>
              <div className="text-xs text-zinc-500">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      <AdminCard title="Your Campaigns">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={<Rocket className="w-8 h-8 text-zinc-500" />}
            title="No campaigns yet"
            description="Create your first campaign to auto-generate hooks, scripts, and content items from your product in minutes."
            action={
              <Link
                href="/admin/campaigns/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Your First Campaign
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {campaigns.map(c => {
              const genStyle = GEN_STATUS_STYLES[c.generation_status || 'pending'] || GEN_STATUS_STYLES.pending;
              return (
                <div key={c.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{c.name}</span>
                      {c.platform && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded uppercase tracking-wider">
                          {PLATFORM_LABELS[c.platform] ?? c.platform}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${genStyle.bg} ${genStyle.text}`}>
                        {genStyle.icon}
                        {genStyle.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {c.brand_name && <span className="text-xs text-zinc-500">{c.brand_name}</span>}
                      {c.product_name && <span className="text-xs text-zinc-600">· {c.product_name}</span>}
                      <span className="text-xs text-zinc-600">{timeAgo(c.created_at)}</span>
                    </div>

                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
                        <Zap className="w-3 h-3 text-amber-400" />
                        {c.hooks_generated} hooks
                      </span>
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
                        <FileText className="w-3 h-3 text-violet-400" />
                        {c.scripts_generated} scripts
                      </span>
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
                        <LayoutList className="w-3 h-3 text-blue-400" />
                        {c.items_created} items
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/admin/pipeline?experiment_id=${c.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors"
                    >
                      Pipeline
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                    <Link
                      href={`/admin/experiments`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors"
                    >
                      Details
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {/* Quick link to experiments for more detail */}
      {campaigns.length > 0 && (
        <div className="mt-4 text-center">
          <Link
            href="/admin/experiments"
            className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
          >
            View full experiment detail in Experiments →
          </Link>
        </div>
      )}
    </AdminPageLayout>
  );
}
