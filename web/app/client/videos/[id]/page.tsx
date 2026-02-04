'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import ClientNav from '../../components/ClientNav';

interface AuthUser {
  id: string;
  email: string | null;
}

interface VideoDetail {
  id: string;
  status: string;
  recording_status: string;
  created_at: string;
  last_status_changed_at: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  script_locked_text: string | null;
}

interface TimelineEvent {
  id: string;
  type: string;
  created_at: string;
  from_status: string | null;
  to_status: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NOT_RECORDED: { bg: 'bg-slate-100', text: 'text-slate-600' },
  RECORDED: { bg: 'bg-amber-100', text: 'text-amber-700' },
  EDITED: { bg: 'bg-blue-100', text: 'text-blue-700' },
  READY_TO_POST: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  POSTED: { bg: 'bg-green-100', text: 'text-green-700' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function ClientVideoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const videoId = params.id as string;
  const hydrated = useHydrated();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scriptOpen, setScriptOpen] = useState(false);

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push(`/login?redirect=/client/videos/${videoId}`);
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push(`/login?redirect=/client/videos/${videoId}`);
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router, videoId]);

  // Fetch video details
  useEffect(() => {
    if (!authUser || !videoId) return;

    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/client/videos/${videoId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setVideo(data.data.video);
            setTimeline(data.data.timeline || []);
          } else {
            setError(data.error || 'Failed to load video');
          }
        } else if (res.status === 404) {
          setError('Video not found');
        } else {
          setError('Failed to load video');
        }
      } catch (err) {
        console.error('Failed to fetch video:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [authUser, videoId]);

  const displayTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Checking access...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Redirecting to login...</div>
      </div>
    );
  }

  const statusKey = video?.recording_status || 'NOT_RECORDED';
  const colors = STATUS_COLORS[statusKey] || STATUS_COLORS.NOT_RECORDED;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} />

        {/* Back Link */}
        <div className="mb-4">
          <Link
            href="/client/videos"
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            &larr; Back to Videos
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="p-8 text-center text-slate-500">Loading video...</div>
        )}

        {/* Video Details */}
        {!loading && video && (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-slate-800 font-mono">
                    {video.id.slice(0, 8)}...
                  </h1>
                  <p className="mt-1 text-sm text-slate-500 font-mono">
                    {video.id}
                  </p>
                </div>
                <span className={`px-3 py-1.5 text-sm font-medium rounded-full ${colors.bg} ${colors.text}`}>
                  {statusKey.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Meta Info */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide">Created</div>
                  <div className="mt-1 text-sm text-slate-700">{displayTime(video.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide">Last Updated</div>
                  <div className="mt-1 text-sm text-slate-700">{displayTime(video.last_status_changed_at)}</div>
                </div>
                {video.posted_platform && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Platform</div>
                    <div className="mt-1 text-sm text-slate-700 capitalize">{video.posted_platform}</div>
                  </div>
                )}
                {video.posted_url && (
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Posted URL</div>
                    <a
                      href={video.posted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      View Post &rarr;
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Script Accordion */}
            {video.script_locked_text && (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <button type="button"
                  onClick={() => setScriptOpen(!scriptOpen)}
                  className="w-full px-5 py-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-medium text-slate-700">Script</span>
                  <span className="text-slate-400">{scriptOpen ? '-' : '+'}</span>
                </button>
                {scriptOpen && (
                  <div className="px-5 py-4 border-t border-slate-200">
                    <pre className="whitespace-pre-wrap text-sm text-slate-600 font-mono bg-slate-50 p-4 rounded-md">
                      {video.script_locked_text}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">Timeline</h2>
              </div>
              <div className="p-5">
                {timeline.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-500">
                    No timeline events available.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {timeline.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-3 rounded-md bg-slate-50"
                      >
                        <div className="w-2 h-2 mt-1.5 rounded-full bg-slate-400" />
                        <div className="flex-1">
                          <div className="text-sm text-slate-700">
                            {event.from_status && event.to_status ? (
                              <>
                                Status changed: {event.from_status.replace(/_/g, ' ')} &rarr; {event.to_status.replace(/_/g, ' ')}
                              </>
                            ) : (
                              event.type.replace(/_/g, ' ')
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {displayTime(event.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
