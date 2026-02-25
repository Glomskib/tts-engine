'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ExternalLink, Clock, Mic, Scissors,
  CheckCircle2, Send, XCircle, ChevronDown, ChevronUp,
  Video, Copy, Check
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import ClientNav from '../../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

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

const STATUS_CONFIG: Record<string, {
  label: string;
  bg: string;
  text: string;
  borderColor: string;
  icon: typeof Clock;
  description: string;
}> = {
  NOT_RECORDED: {
    label: 'Needs Recording',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    borderColor: 'border-slate-200',
    icon: Mic,
    description: 'This script is ready to record. Once recorded, it moves into editing.',
  },
  RECORDED: {
    label: 'Recorded — In Editing',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    borderColor: 'border-amber-200',
    icon: Scissors,
    description: 'Your recording is being edited. You\'ll be notified when it\'s ready for review.',
  },
  EDITED: {
    label: 'Edited — Ready to Review',
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    borderColor: 'border-teal-200',
    icon: CheckCircle2,
    description: 'The edited video is ready for your review.',
  },
  READY_TO_POST: {
    label: 'Approved — Ready to Post',
    bg: 'bg-cyan-100',
    text: 'text-cyan-700',
    borderColor: 'border-cyan-200',
    icon: Send,
    description: 'Video is approved and ready to be published.',
  },
  POSTED: {
    label: 'Posted',
    bg: 'bg-green-100',
    text: 'text-green-700',
    borderColor: 'border-green-200',
    icon: CheckCircle2,
    description: 'This video has been published.',
  },
  REJECTED: {
    label: 'Rejected',
    bg: 'bg-red-100',
    text: 'text-red-700',
    borderColor: 'border-red-200',
    icon: XCircle,
    description: 'This video was rejected and will not be published.',
  },
};

const PIPELINE_STEPS = [
  { key: 'NOT_RECORDED', label: 'Script' },
  { key: 'RECORDED', label: 'Recording' },
  { key: 'EDITED', label: 'Editing' },
  { key: 'READY_TO_POST', label: 'Approved' },
  { key: 'POSTED', label: 'Posted' },
];

const STATUS_ORDER: Record<string, number> = {
  NOT_RECORDED: 0,
  RECORDED: 1,
  EDITED: 2,
  READY_TO_POST: 3,
  POSTED: 4,
  REJECTED: 2,
};

const TIMELINE_LABELS: Record<string, string> = {
  NOT_RECORDED: 'Needs Recording',
  RECORDED: 'Recorded',
  EDITED: 'Edited',
  READY_TO_POST: 'Approved',
  POSTED: 'Posted',
  REJECTED: 'Rejected',
};

export default function ClientVideoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const videoId = params.id as string;
  const hydrated = useHydrated();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scriptOpen, setScriptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
      } catch {
        setBranding(getDefaultOrgBranding());
      }
    };

    fetchBranding();
  }, [authUser]);

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

  const handleCopyId = async () => {
    if (!video) return;
    try {
      await navigator.clipboard.writeText(video.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <ClientNav userName={authUser.email || undefined} branding={branding} />
          <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mb-6" />
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse mb-8" />
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-slate-100 rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <ClientNav userName={authUser.email || undefined} branding={branding} />
          <Link
            href="/client/videos"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Videos
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-red-700 font-medium">{error || 'Video not found'}</div>
          </div>
        </div>
      </div>
    );
  }

  const statusKey = video.recording_status || 'NOT_RECORDED';
  const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG.NOT_RECORDED;
  const StatusIcon = config.icon;
  const currentStep = STATUS_ORDER[statusKey] ?? 0;
  const accentText = branding?.accent_text_class || 'text-slate-800';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Back */}
        <Link
          href="/client/videos"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Videos
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-2xl font-semibold ${accentText}`}>
                Video {video.id.slice(0, 8)}
              </h1>
              <button
                type="button"
                onClick={handleCopyId}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                title="Copy full ID"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Created {displayTime(video.created_at)}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
            <StatusIcon className="w-4 h-4" />
            {config.label}
          </span>
        </div>

        {/* Pipeline Progress */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-1">
            {PIPELINE_STEPS.map((step, idx) => {
              const isCompleted = idx < currentStep;
              const isCurrent = idx === currentStep;
              const isRejected = isCurrent && statusKey === 'REJECTED';

              return (
                <div key={step.key} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex items-center">
                    {idx > 0 && (
                      <div className={`flex-1 h-1 rounded-full ${
                        isCompleted || isCurrent ? 'bg-teal-500' : 'bg-slate-200'
                      }`} />
                    )}
                    <div className={`w-3 h-3 rounded-full shrink-0 ${
                      isRejected
                        ? 'bg-red-500'
                        : isCompleted
                          ? 'bg-teal-500'
                          : isCurrent
                            ? 'bg-teal-500 ring-4 ring-teal-100'
                            : 'bg-slate-200'
                    }`} />
                    {idx < PIPELINE_STEPS.length - 1 && (
                      <div className={`flex-1 h-1 rounded-full ${
                        isCompleted ? 'bg-teal-500' : 'bg-slate-200'
                      }`} />
                    )}
                  </div>
                  <span className={`text-[11px] mt-2 text-center ${
                    isRejected
                      ? 'text-red-600 font-semibold'
                      : isCurrent
                        ? 'text-teal-700 font-semibold'
                        : isCompleted
                          ? 'text-teal-600'
                          : 'text-slate-400'
                  }`}>
                    {isRejected ? 'Rejected' : step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Status description */}
          <div className={`mt-4 pt-4 border-t border-slate-100 flex items-start gap-2`}>
            <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${config.text}`} />
            <p className="text-sm text-slate-600">{config.description}</p>
          </div>
        </div>

        {/* Posted URL / Deliverable */}
        {video.posted_url && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-green-900">Published</h3>
            </div>
            <div className="flex items-center justify-between">
              <div>
                {video.posted_platform && (
                  <p className="text-sm text-green-700 capitalize mb-1">Platform: {video.posted_platform}</p>
                )}
                <a
                  href={video.posted_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-green-700 hover:text-green-900 underline break-all"
                >
                  {video.posted_url}
                </a>
              </div>
              <a
                href={video.posted_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 ml-4 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open Post
              </a>
            </div>
          </div>
        )}

        {/* Script Section */}
        {video.script_locked_text && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
            <button type="button"
              onClick={() => setScriptOpen(!scriptOpen)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-slate-500" />
                <span className="font-medium text-slate-700">Script</span>
              </div>
              {scriptOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>
            {scriptOpen && (
              <div className="px-5 py-4 border-t border-slate-200">
                <pre className="whitespace-pre-wrap text-sm text-slate-600 font-mono bg-slate-50 p-4 rounded-lg leading-relaxed">
                  {video.script_locked_text}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Metadata Grid */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Details</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Video ID</div>
                <div className="font-mono text-slate-700 mt-0.5">{video.id.slice(0, 12)}...</div>
              </div>
              <div>
                <div className="text-slate-500">Created</div>
                <div className="text-slate-700 mt-0.5">
                  {hydrated ? formatDateString(video.created_at) : video.created_at.split('T')[0]}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Last Updated</div>
                <div className="text-slate-700 mt-0.5">{displayTime(video.last_status_changed_at)}</div>
              </div>
              {video.posted_platform && (
                <div>
                  <div className="text-slate-500">Platform</div>
                  <div className="text-slate-700 capitalize mt-0.5">{video.posted_platform}</div>
                </div>
              )}
              <div>
                <div className="text-slate-500">Status</div>
                <div className={`mt-0.5 font-medium ${config.text}`}>{config.label}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Timeline</h3>
          </div>
          <div className="p-5">
            {timeline.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                No activity yet. Timeline events appear as your video moves through the pipeline.
              </div>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200" />

                <div className="space-y-4">
                  {timeline.map((event) => {
                    const toLabel = event.to_status ? (TIMELINE_LABELS[event.to_status] || event.to_status.replace(/_/g, ' ')) : null;
                    const fromLabel = event.from_status ? (TIMELINE_LABELS[event.from_status] || event.from_status.replace(/_/g, ' ')) : null;
                    const toColors = event.to_status ? (STATUS_CONFIG[event.to_status] || STATUS_CONFIG.NOT_RECORDED) : null;

                    return (
                      <div key={event.id} className="flex items-start gap-3 relative">
                        <div className={`w-4 h-4 rounded-full shrink-0 mt-0.5 border-2 border-white z-10 ${
                          toColors ? toColors.bg : 'bg-slate-200'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-700">
                            {fromLabel && toLabel ? (
                              <>{fromLabel} <span className="text-slate-400 mx-1">&rarr;</span> <span className="font-medium">{toLabel}</span></>
                            ) : (
                              <span className="font-medium">{event.type.replace(/_/g, ' ')}</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {displayTime(event.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
