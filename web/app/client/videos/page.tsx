'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Video, Clock, Mic, Scissors, CheckCircle2, Send,
  XCircle, ChevronRight, FileText
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import ClientNav from '../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

interface VideoItem {
  id: string;
  status: string;
  recording_status: string;
  created_at: string;
  last_status_changed_at: string | null;
  posted_url: string | null;
  posted_platform: string | null;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  bg: string;
  text: string;
  icon: typeof Clock;
  nextAction: string | null;
}> = {
  NOT_RECORDED: {
    label: 'Needs Recording',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    icon: Mic,
    nextAction: 'Record',
  },
  RECORDED: {
    label: 'Recorded — Editing',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    icon: Scissors,
    nextAction: 'View',
  },
  EDITED: {
    label: 'Edited — Ready to Review',
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    icon: CheckCircle2,
    nextAction: 'Review',
  },
  READY_TO_POST: {
    label: 'Approved — Ready to Post',
    bg: 'bg-cyan-100',
    text: 'text-cyan-700',
    icon: Send,
    nextAction: 'Mark Posted',
  },
  POSTED: {
    label: 'Posted',
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: CheckCircle2,
    nextAction: null,
  },
  REJECTED: {
    label: 'Rejected',
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: XCircle,
    nextAction: 'View',
  },
};

export default function ClientVideosPage() {
  const { user } = useAuth();
  const authUser = { id: user?.id || '', email: user?.email || null };
  const hydrated = useHydrated();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orgRequired, setOrgRequired] = useState(false);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!authUser) return;

    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/client/branding');
        const data = await res.json();

        if (res.ok && data.ok && data.data?.branding) {
          setBranding(data.data.branding);
        } else {
          setBranding(getDefaultOrgBranding());
        }
      } catch (err) {
        console.error('Failed to fetch branding:', err);
        setBranding(getDefaultOrgBranding());
      }
    };

    fetchBranding();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;

    const fetchVideos = async () => {
      try {
        const res = await fetch('/api/client/videos?limit=100');
        const data = await res.json();

        if (res.status === 403 && data.error === 'client_org_required') {
          setOrgRequired(true);
        } else if (res.ok && data.ok) {
          setVideos(data.data || []);
        } else {
          setError(data.error || 'Failed to load videos');
        }
      } catch (err) {
        console.error('Failed to fetch videos:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [authUser]);

  const displayTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  const accentText = branding?.accent_text_class || 'text-slate-800';
  const accentBg = branding?.accent_bg_class || 'bg-slate-800';

  const filteredVideos = videos.filter(v => {
    if (filter === 'all') return true;
    if (filter === 'active') return !['POSTED', 'REJECTED'].includes(v.recording_status);
    if (filter === 'review') return v.recording_status === 'EDITED';
    if (filter === 'posted') return v.recording_status === 'POSTED';
    return true;
  });

  const needsAttentionCount = videos.filter(v =>
    ['EDITED', 'READY_TO_POST'].includes(v.recording_status)
  ).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${accentText}`}>Videos</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track the status of your video projects.
            </p>
          </div>
          {needsAttentionCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-full">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-medium text-teal-700">
                {needsAttentionCount} need{needsAttentionCount === 1 ? 's' : ''} your attention
              </span>
            </div>
          )}
        </div>

        {/* Org Required State */}
        {orgRequired ? (
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm p-8 text-center">
            <div className="text-amber-600 mb-2 text-lg font-medium">Portal Not Connected</div>
            <p className="text-slate-600 mb-4">
              Your portal is not yet connected to an organization.
            </p>
            <p className="text-sm text-slate-500">
              Please contact support to get started.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Filters */}
            {!loading && videos.length > 0 && (
              <div className="flex gap-2 mb-4">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'active', label: 'Active' },
                  { key: 'review', label: 'Needs Review' },
                  { key: 'posted', label: 'Posted' },
                ].map(f => (
                  <button type="button"
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filter === f.key
                        ? `${accentBg} text-white`
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Videos List */}
            {loading ? (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center text-slate-500">
                Loading videos...
              </div>
            ) : videos.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm py-16 text-center">
                <Video className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <div className="text-lg font-medium text-slate-700 mb-2">No videos yet</div>
                <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                  Create your first script to get started. Once a request is converted,
                  your video will appear here for tracking.
                </p>
                <Link
                  href="/client/requests/new"
                  className={`inline-flex items-center gap-2 px-5 py-2.5 ${accentBg} text-white text-sm font-medium rounded-md hover:opacity-90`}
                >
                  <FileText className="w-4 h-4" />
                  Create Your First Script
                </Link>
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm py-12 text-center">
                <p className="text-slate-500">No videos match this filter.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVideos.map((video) => {
                  const statusKey = video.recording_status || 'NOT_RECORDED';
                  const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG.NOT_RECORDED;
                  const StatusIcon = config.icon;

                  return (
                    <Link
                      key={video.id}
                      href={`/client/videos/${video.id}`}
                      className={`block bg-white rounded-lg border p-4 hover:shadow-md transition-all ${
                        ['EDITED', 'READY_TO_POST'].includes(statusKey)
                          ? 'border-teal-200 bg-teal-50/30'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${config.bg}`}>
                          <StatusIcon className={`w-5 h-5 ${config.text}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-slate-700">
                              {video.id.slice(0, 8)}
                            </span>
                            {video.posted_platform && (
                              <span className="text-xs text-slate-400 capitalize">{video.posted_platform}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-slate-400">
                              {displayTime(video.last_status_changed_at || video.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Next Action */}
                        <div className="flex items-center gap-2 shrink-0">
                          {config.nextAction && (
                            <span className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                              ['EDITED', 'READY_TO_POST'].includes(statusKey)
                                ? 'bg-teal-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {config.nextAction}
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Count */}
            {!loading && videos.length > 0 && (
              <div className="mt-3 text-sm text-slate-500">
                Showing {filteredVideos.length} of {videos.length} video{videos.length !== 1 ? 's' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
