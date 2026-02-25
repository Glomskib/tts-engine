'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Clock, CheckCircle2, XCircle, ArrowRight, Eye,
  Send, Zap, AlertTriangle, FileText
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import { SLA_THRESHOLDS_MS } from '@/lib/client-requests';
import ClientNav from '../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

const PROCESSING_LONGER_THRESHOLD_MS = SLA_THRESHOLDS_MS.NORMAL;

function formatProcessingTime(ms: number): string {
  if (ms < 0) return '0m';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return minutes > 0 ? `${minutes}m` : '<1m';
}

interface AuthUser {
  id: string;
  email: string | null;
}

interface ClientRequest {
  request_id: string;
  project_id?: string;
  request_type: 'AI_CONTENT' | 'UGC_EDIT';
  title: string;
  status: string;
  video_id?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  bg: string;
  text: string;
  icon: typeof Clock;
  description: string;
}> = {
  SUBMITTED: {
    label: 'Submitted',
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    icon: Send,
    description: 'Awaiting team review',
  },
  IN_REVIEW: {
    label: 'In Review',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    icon: Eye,
    description: 'Being reviewed by our team',
  },
  APPROVED: {
    label: 'Approved',
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: CheckCircle2,
    description: 'Approved — converting to video',
  },
  REJECTED: {
    label: 'Needs Changes',
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: XCircle,
    description: 'See feedback below',
  },
  CONVERTED: {
    label: 'In Production',
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    icon: Zap,
    description: 'Video is being produced',
  },
};

const TYPE_LABELS: Record<string, string> = {
  AI_CONTENT: 'AI Content',
  UGC_EDIT: 'UGC Edit',
};

function getNextAction(req: ClientRequest): { label: string; href: string; color: string } | null {
  switch (req.status) {
    case 'CONVERTED':
      if (req.video_id) {
        return { label: 'View Video', href: `/client/videos/${req.video_id}`, color: 'bg-purple-600 hover:bg-purple-700' };
      }
      return null;
    case 'REJECTED':
      return { label: 'Revise & Resubmit', href: `/client/requests/${req.request_id}`, color: 'bg-red-600 hover:bg-red-700' };
    case 'IN_REVIEW':
    case 'APPROVED':
    case 'SUBMITTED':
      return { label: 'View Details', href: `/client/requests/${req.request_id}`, color: 'bg-slate-600 hover:bg-slate-700' };
    default:
      return null;
  }
}

export default function ClientRequestsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orgRequired, setOrgRequired] = useState(false);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/client/requests');
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/client/requests');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

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

    const fetchRequests = async () => {
      try {
        const res = await fetch('/api/client/requests');
        const data = await res.json();

        if (res.status === 403 && data.error === 'client_org_required') {
          setOrgRequired(true);
        } else if (res.ok && data.ok) {
          setRequests(data.data || []);
        } else {
          setError(data.error || 'Failed to load requests');
        }
      } catch (err) {
        console.error('Failed to fetch requests:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [authUser]);

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

  const accentText = branding?.accent_text_class || 'text-slate-800';
  const accentBg = branding?.accent_bg_class || 'bg-slate-800';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${accentText}`}>Requests</h1>
            <p className="mt-1 text-sm text-slate-500">
              Submit and track your content requests.
            </p>
          </div>

          <Link
            href="/client/requests/new"
            className={`px-4 py-2 ${accentBg} text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity`}
          >
            New Request
          </Link>
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

            {/* Requests List */}
            {loading ? (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center text-slate-500">
                Loading requests...
              </div>
            ) : requests.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm py-16 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <div className="text-lg font-medium text-slate-700 mb-2">No requests yet</div>
                <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                  Submit your first content request to kick off your pipeline.
                  We handle AI content creation and UGC editing.
                </p>
                <Link
                  href="/client/requests/new"
                  className={`inline-flex items-center gap-2 px-5 py-2.5 ${accentBg} text-white text-sm font-medium rounded-md hover:opacity-90`}
                >
                  Create Your First Request
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => {
                  const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.SUBMITTED;
                  const StatusIcon = config.icon;
                  const action = getNextAction(req);

                  // SLA / timing
                  let timingLabel: string | null = null;
                  let timingColor = 'text-slate-400';
                  if (hydrated && !['CONVERTED', 'REJECTED'].includes(req.status)) {
                    const ageMs = now - new Date(req.created_at).getTime();
                    const isTakingLonger = ageMs > PROCESSING_LONGER_THRESHOLD_MS;

                    if (isTakingLonger) {
                      timingLabel = 'Taking longer than usual';
                      timingColor = 'text-amber-600';
                    } else if (req.status === 'IN_REVIEW') {
                      timingLabel = `In review for ${formatProcessingTime(now - new Date(req.updated_at).getTime())}`;
                    } else if (req.status === 'APPROVED') {
                      timingLabel = `Converting for ${formatProcessingTime(now - new Date(req.updated_at).getTime())}`;
                    } else {
                      timingLabel = `Submitted ${formatProcessingTime(ageMs)} ago`;
                    }
                  }

                  return (
                    <div
                      key={req.request_id}
                      className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-4">
                        {/* Status Icon */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${config.bg}`}>
                          <StatusIcon className={`w-5 h-5 ${config.text}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/client/requests/${req.request_id}`}
                              className="font-medium text-slate-800 hover:text-slate-600 truncate"
                            >
                              {req.title}
                            </Link>
                            <span className="text-xs text-slate-400 shrink-0">
                              {TYPE_LABELS[req.request_type] || req.request_type}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 mt-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
                              {config.label}
                            </span>
                            {timingLabel && (
                              <span className={`flex items-center gap-1 text-xs ${timingColor}`}>
                                <Clock className="w-3 h-3" />
                                {timingLabel}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-400 mt-1">{config.description}</p>
                        </div>

                        {/* Next Action */}
                        {action && (
                          <Link
                            href={action.href}
                            className={`shrink-0 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${action.color}`}
                          >
                            {action.label}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Count and Billing Note */}
            {!loading && requests.length > 0 && (
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                <span>Showing {requests.length} request{requests.length !== 1 ? 's' : ''}</span>
                <span className="text-xs text-slate-400">
                  Requests count toward billing once converted to video
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
