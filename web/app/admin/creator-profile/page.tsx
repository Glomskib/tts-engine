'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState, StatCard, SectionDivider } from '../components/AdminPageLayout';
import { SkeletonAuthCheck, SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

// ── Types ───────────────────────────────────────────────────────────

interface DimensionEntry {
  value: string;
  sample_size: number;
  avg_score: number;
  avg_views: number;
  win_rate: number;
  confidence: string;
}

interface ProfileData {
  workspace_id: string;
  total_posts: number;
  total_views: number;
  avg_engagement_rate: number;
  median_views: number;
  best_score: number;
  dimensions: Record<string, DimensionEntry[]>;
  last_aggregated_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const DIMENSION_LABELS: Record<string, string> = {
  hook_pattern: 'Hook Patterns',
  angle: 'Content Angles',
  format: 'Formats',
  platform: 'Platforms',
  product: 'Products',
  length_bucket: 'Video Length',
  hook_type: 'Hook Types',
  persona: 'Personas',
};

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-emerald-400/10', text: 'text-emerald-400', label: 'High confidence' },
  medium: { bg: 'bg-amber-400/10', text: 'text-amber-400', label: 'Building confidence' },
  low: { bg: 'bg-zinc-400/10', text: 'text-zinc-400', label: 'Needs more data' },
};

// ── Page ────────────────────────────────────────────────────────────

export default function CreatorProfilePage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login?redirect=/admin/creator-profile'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/creator-profile');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/admin/creator-profile');
      const json = await res.json();
      if (json.ok) {
        setProfile(json.data || null);
      }
    } catch {
      showError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/creator-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.ok) {
        showSuccess(`Profile updated: ${json.data.total_posts} posts, ${json.data.dimensions_updated} dimensions`);
        await fetchProfile();
      } else {
        showError('Refresh failed');
      }
    } catch {
      showError('Failed to refresh profile');
    } finally {
      setRefreshing(false);
    }
  };

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;

  return (
    <AdminPageLayout
      title="Creator Profile"
      subtitle="What works best for your content"
      stage="analytics"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Creator Profile' },
      ]}
      headerActions={
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Profile'}
        </AdminButton>
      }
    >
      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : !profile ? (
        <EmptyState
          title="No performance data yet"
          description="Post content and track metrics to build your creator profile. The profile learns what hooks, angles, and formats work best."
          action={
            <AdminButton variant="primary" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Building...' : 'Build Profile Now'}
            </AdminButton>
          }
        />
      ) : (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Posts" value={profile.total_posts} />
            <StatCard label="Total Views" value={formatViews(profile.total_views)} />
            <StatCard
              label="Avg Engagement"
              value={`${profile.avg_engagement_rate.toFixed(1)}%`}
              variant={profile.avg_engagement_rate >= 5 ? 'success' : 'default'}
            />
            <StatCard label="Best Score" value={profile.best_score} variant="success" />
          </div>

          <div className="text-[11px] text-zinc-600 text-right">
            Last updated {timeAgo(profile.last_aggregated_at)} · Median views: {formatViews(profile.median_views)}
          </div>

          {/* Dimension Breakdowns */}
          {Object.keys(profile.dimensions).length === 0 ? (
            <AdminCard title="Dimensions">
              <p className="text-sm text-zinc-500">Not enough data to show dimension breakdowns. Keep posting and tracking metrics.</p>
            </AdminCard>
          ) : (
            <>
              <SectionDivider label="What Works Best" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(profile.dimensions).map(([dim, entries]) => (
                  <DimensionCard key={dim} dimension={dim} entries={entries} />
                ))}
              </div>
            </>
          )}

          {/* How It Works */}
          <SectionDivider label="How It Works" />
          <AdminCard>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-zinc-200 font-medium mb-1">1. Post & Track</div>
                <p className="text-zinc-500">Your profile builds automatically from posted content with tracked metrics (views, engagement, completion).</p>
              </div>
              <div>
                <div className="text-zinc-200 font-medium mb-1">2. Learn Patterns</div>
                <p className="text-zinc-500">The system identifies which hooks, angles, formats, and video lengths perform best for your audience.</p>
              </div>
              <div>
                <div className="text-zinc-200 font-medium mb-1">3. Inform Generation</div>
                <p className="text-zinc-500">As confidence builds, your profile biases content generation toward what works — while still exploring new approaches.</p>
              </div>
            </div>
          </AdminCard>
        </>
      )}
    </AdminPageLayout>
  );
}

// ── Dimension Card ──────────────────────────────────────────────────

function DimensionCard({ dimension, entries }: { dimension: string; entries: DimensionEntry[] }) {
  const label = DIMENSION_LABELS[dimension] || dimension;
  const confidence = entries[0]?.confidence || 'low';
  const confStyle = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.low;

  return (
    <AdminCard title={label}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${confStyle.bg} ${confStyle.text}`}>
          {confStyle.label}
        </span>
      </div>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={entry.value} className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-600 w-4 text-right">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-300 truncate" title={entry.value}>
                {entry.value}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-600 mt-0.5">
                <span>Score: <span className="text-zinc-400">{entry.avg_score}</span></span>
                <span>Views: <span className="text-zinc-400">{formatViews(entry.avg_views)}</span></span>
                {entry.win_rate > 0 && (
                  <span>Win: <span className="text-emerald-400">{entry.win_rate.toFixed(0)}%</span></span>
                )}
                <span className="text-zinc-700">n={entry.sample_size}</span>
              </div>
            </div>
            {/* Score bar */}
            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden flex-shrink-0">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${Math.min(100, entry.avg_score)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
