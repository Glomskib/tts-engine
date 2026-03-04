'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard } from '../../components/AdminPageLayout';
import {
  Trophy, Sparkles, Loader2, RefreshCw, Copy, Check, ExternalLink,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface WinnerPost {
  id: string;
  title: string;
  product_name: string | null;
  platform: string | null;
  performance_score: number;
  posted_at: string | null;
  post_url: string | null;
  has_insight: boolean;
  insight: { hook?: string } | null;
}

interface Replication {
  angle: string;
  hook: string;
  why: string;
}

export default function WinnersPage() {
  const { showError } = useToast();
  const [winners, setWinners] = useState<WinnerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [replicating, setReplicating] = useState<string | null>(null);
  const [replications, setReplications] = useState<Record<string, Replication[]>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence/winners');
      const json = await res.json();
      if (json.ok) setWinners(json.data || []);
    } catch {
      showError('Failed to load winners');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReplicate = async (post: WinnerPost) => {
    const hook = post.insight?.hook || post.title;
    setReplicating(post.id);
    try {
      const res = await fetch('/api/intelligence/winners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook }),
      });
      const json = await res.json();
      if (json.ok && json.data?.replications) {
        setReplications(prev => ({ ...prev, [post.id]: json.data.replications }));
      } else {
        showError(json.error || 'Failed to generate replications');
      }
    } catch {
      showError('Network error');
    } finally {
      setReplicating(null);
    }
  };

  if (loading) {
    return (
      <AdminPageLayout title="Replication Engine" subtitle="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Replication Engine"
      subtitle="Replicate your top-performing content with new angles"
      maxWidth="2xl"
      headerActions={
        <button onClick={fetchData} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      }
    >
      {winners.length === 0 ? (
        <AdminCard title="No Winners Yet">
          <p className="text-sm text-zinc-500 py-6 text-center">Post more content and track performance to see your winners here.</p>
        </AdminCard>
      ) : (
        winners.map(post => (
          <AdminCard
            key={post.id}
            title={post.title}
            subtitle={[post.product_name, post.platform, `Score: ${post.performance_score}`].filter(Boolean).join(' · ')}
          >
            <div className="space-y-3">
              {/* Post info */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border text-emerald-400 bg-emerald-400/10 border-emerald-400/30">
                  {post.performance_score.toFixed(1)}
                </span>
                {post.post_url && (
                  <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> View Post
                  </a>
                )}
              </div>

              {/* Generate replications button */}
              {!replications[post.id] && (
                <button
                  onClick={() => handleReplicate(post)}
                  disabled={replicating === post.id}
                  className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-sm font-medium bg-violet-600 text-white active:bg-violet-700 disabled:opacity-50"
                >
                  {replicating === post.id ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Trophy className="w-4 h-4" /> Generate 3 Replications</>
                  )}
                </button>
              )}

              {/* Replications */}
              {replications[post.id] && (
                <div className="space-y-3">
                  {replications[post.id].map((rep, ri) => (
                    <div key={ri} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-bold text-violet-400 bg-violet-400/10 px-2 py-0.5 rounded-full mt-0.5">{rep.angle}</span>
                        <p className="text-sm text-white leading-relaxed">&ldquo;{rep.hook}&rdquo;</p>
                      </div>
                      <p className="text-xs text-zinc-500">{rep.why}</p>
                      <Link
                        href={`/admin/content-studio?inspiration=${encodeURIComponent(rep.hook)}`}
                        className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-lg text-sm font-medium bg-teal-600 text-white active:bg-teal-700"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Create Script
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AdminCard>
        ))
      )}
    </AdminPageLayout>
  );
}
