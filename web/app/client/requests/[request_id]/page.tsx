'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ExternalLink, FolderOpen, Clock,
  CheckCircle2, XCircle, Eye, Send, Zap, AlertTriangle
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import ClientNav from '../../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';
import { SLA_THRESHOLDS_MS } from '@/lib/client-requests';

const PROCESSING_LONGER_THRESHOLD_MS = SLA_THRESHOLDS_MS.NORMAL;

interface AuthUser {
  id: string;
  email: string | null;
}

interface ClientRequest {
  request_id: string;
  project_id?: string;
  request_type: 'AI_CONTENT' | 'UGC_EDIT';
  title: string;
  brief: string;
  product_url?: string;
  ugc_links?: string[];
  notes?: string;
  status: string;
  status_reason?: string;
  video_id?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: typeof Clock;
}> = {
  SUBMITTED: { label: 'Submitted', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: Send },
  IN_REVIEW: { label: 'In Review', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Eye },
  APPROVED: { label: 'Approved', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: CheckCircle2 },
  REJECTED: { label: 'Needs Changes', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle },
  CONVERTED: { label: 'In Production', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: Zap },
};

const TYPE_LABELS: Record<string, string> = {
  AI_CONTENT: 'AI Content',
  UGC_EDIT: 'UGC Edit',
};

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

function classifyUrl(url: string): 'drive_folder' | 'drive_file' | 'dropbox' | 'url' {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (host.includes('drive.google.com')) {
      return parsed.pathname.includes('/folders/') ? 'drive_folder' : 'drive_file';
    }
    if (host.includes('dropbox.com')) return 'dropbox';
    return 'url';
  } catch {
    return 'url';
  }
}

function getLinkDisplay(type: ReturnType<typeof classifyUrl>) {
  switch (type) {
    case 'drive_folder': return { label: 'Google Drive Folder', icon: FolderOpen, color: 'text-green-700', bg: 'bg-green-50 border-green-200' };
    case 'drive_file': return { label: 'Google Drive File', icon: ExternalLink, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' };
    case 'dropbox': return { label: 'Dropbox', icon: ExternalLink, color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' };
    default: return { label: 'Link', icon: ExternalLink, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' };
  }
}

export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ request_id: string }>;
}) {
  const { request_id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [request, setRequest] = useState<ClientRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
          router.push(`/login?redirect=/client/requests/${request_id}`);
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push(`/login?redirect=/client/requests/${request_id}`);
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router, request_id]);

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
    if (!authUser) return;

    const fetchRequest = async () => {
      try {
        const res = await fetch(`/api/client/requests/${request_id}`);
        const data = await res.json();

        if (res.ok && data.ok) {
          setRequest(data.data);
        } else if (res.status === 404) {
          setError('Request not found');
        } else {
          setError(data.message || data.error || 'Failed to load request');
        }
      } catch (err) {
        console.error('Failed to fetch request:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [authUser, request_id]);

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
          </div>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <ClientNav userName={authUser.email || undefined} branding={branding} />
          <Link href="/client/requests" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Requests
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-red-700 font-medium">{error || 'Request not found'}</div>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.SUBMITTED;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Back */}
        <Link href="/client/requests" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Requests
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className={`text-2xl font-semibold ${accentText}`}>{request.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {TYPE_LABELS[request.request_type] || request.request_type}
            </p>
          </div>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
            <StatusIcon className="w-4 h-4" />
            {statusConfig.label}
          </div>
        </div>

        {/* Status Banners */}
        {request.status === 'CONVERTED' && request.video_id && (
          <div className="mb-6 bg-purple-50 border border-purple-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="font-medium text-purple-800">Video Created</div>
                  <p className="text-sm text-purple-600">Your request has been converted and is now in production.</p>
                </div>
              </div>
              <Link
                href={`/client/videos/${request.video_id}`}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
              >
                View Video
              </Link>
            </div>
          </div>
        )}

        {request.status === 'REJECTED' && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-red-800 mb-1">Changes Requested</div>
                {request.status_reason ? (
                  <p className="text-sm text-red-700">{request.status_reason}</p>
                ) : (
                  <p className="text-sm text-red-600">Your request needs changes before it can proceed.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Processing Time Warning */}
        {hydrated && !['CONVERTED', 'REJECTED'].includes(request.status) && (() => {
          const ageMs = now - new Date(request.created_at).getTime();
          if (ageMs > PROCESSING_LONGER_THRESHOLD_MS) {
            return (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700">
                  This request is taking longer than usual ({formatProcessingTime(ageMs)}). Our team is working on it.
                </p>
              </div>
            );
          }
          return null;
        })()}

        {/* Request Details */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 mb-6">
          {/* Brief */}
          <div className="p-6">
            <div className="text-sm font-medium text-slate-500 mb-2">Brief</div>
            <div className="text-slate-800 whitespace-pre-wrap">{request.brief}</div>
          </div>

          {/* Product URL (AI_CONTENT) */}
          {request.request_type === 'AI_CONTENT' && request.product_url && (
            <div className="p-6">
              <div className="text-sm font-medium text-slate-500 mb-2">Product URL</div>
              <a
                href={request.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-teal-700 hover:text-teal-900 bg-teal-50 border border-teal-200 px-3 py-2 rounded-lg"
              >
                <ExternalLink className="w-4 h-4" />
                {request.product_url}
              </a>
            </div>
          )}

          {/* Raw Footage Links (UGC_EDIT) */}
          {request.request_type === 'UGC_EDIT' && request.ugc_links && request.ugc_links.length > 0 && (
            <div className="p-6">
              <div className="text-sm font-medium text-slate-500 mb-3">
                Raw Footage ({request.ugc_links.length} link{request.ugc_links.length !== 1 ? 's' : ''})
              </div>
              <div className="space-y-2">
                {request.ugc_links.map((link, i) => {
                  const linkType = classifyUrl(link);
                  const display = getLinkDisplay(linkType);
                  const LinkIcon = display.icon;

                  return (
                    <a
                      key={i}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors hover:shadow-sm ${display.bg}`}
                    >
                      <LinkIcon className={`w-5 h-5 shrink-0 ${display.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${display.color}`}>{display.label}</div>
                        <div className="text-xs text-slate-500 truncate">{link}</div>
                      </div>
                      {linkType === 'drive_folder' && (
                        <span className="shrink-0 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                          Open Folder
                        </span>
                      )}
                      {linkType !== 'drive_folder' && (
                        <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {request.notes && (
            <div className="p-6">
              <div className="text-sm font-medium text-slate-500 mb-2">Additional Notes</div>
              <div className="text-slate-800 whitespace-pre-wrap">{request.notes}</div>
            </div>
          )}

          {/* Metadata */}
          <div className="p-6 bg-slate-50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Request ID</div>
                <div className="font-mono text-slate-700">{request.request_id.slice(0, 8)}...</div>
              </div>
              <div>
                <div className="text-slate-500">Submitted</div>
                <div className="text-slate-700">
                  {hydrated ? formatDateString(request.created_at) : request.created_at.split('T')[0]}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Processing Time</div>
                <div className="text-slate-700">
                  {hydrated ? (() => {
                    if (request.status === 'CONVERTED') {
                      return `Completed in ${formatProcessingTime(new Date(request.updated_at).getTime() - new Date(request.created_at).getTime())}`;
                    }
                    if (request.status === 'REJECTED') {
                      return `Reviewed in ${formatProcessingTime(new Date(request.updated_at).getTime() - new Date(request.created_at).getTime())}`;
                    }

                    const ageMs = now - new Date(request.created_at).getTime();
                    return `${formatProcessingTime(ageMs)} so far`;
                  })() : '-'}
                </div>
              </div>
              {request.project_id && (
                <div>
                  <div className="text-slate-500">Project</div>
                  <div className="font-mono text-slate-700">{request.project_id.slice(0, 8)}...</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
