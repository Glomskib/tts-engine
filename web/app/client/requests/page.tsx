'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import { SLA_THRESHOLDS_MS } from '@/lib/client-requests';

// Default threshold for client-facing neutral messaging (uses NORMAL priority threshold)
const PROCESSING_LONGER_THRESHOLD_MS = SLA_THRESHOLDS_MS.NORMAL;

/**
 * Format duration in milliseconds to human-readable string.
 */
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
import ClientNav from '../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SUBMITTED: { bg: 'bg-blue-100', text: 'text-blue-700' },
  IN_REVIEW: { bg: 'bg-amber-100', text: 'text-amber-700' },
  APPROVED: { bg: 'bg-green-100', text: 'text-green-700' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700' },
  CONVERTED: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

const TYPE_LABELS: Record<string, string> = {
  AI_CONTENT: 'AI Content',
  UGC_EDIT: 'UGC Edit',
};

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

  // Update "now" every minute for processing time display
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch authenticated user
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

  // Fetch branding
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

  // Fetch requests
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
            {/* Error */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Requests List */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-8 text-center text-slate-500">Loading requests...</div>
              ) : requests.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-slate-400 mb-2">No requests yet</div>
                  <div className="text-sm text-slate-500 mb-4">
                    Submit your first content request to get started.
                  </div>
                  <Link
                    href="/client/requests/new"
                    className={`inline-flex px-4 py-2 ${accentBg} text-white text-sm font-medium rounded-md hover:opacity-90`}
                  >
                    Create Request
                  </Link>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((req) => {
                      const colors = STATUS_COLORS[req.status] || STATUS_COLORS.SUBMITTED;
                      return (
                        <tr key={req.request_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{req.title}</div>
                            {req.video_id && (
                              <div className="text-xs text-slate-400 mt-0.5">
                                Video: {req.video_id.slice(0, 8)}...
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-600">
                              {TYPE_LABELS[req.request_type] || req.request_type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}>
                              {req.status.replace(/_/g, ' ')}
                            </span>
                            {hydrated && req.status !== 'CONVERTED' && req.status !== 'REJECTED' && (() => {
                              const ageMs = now - new Date(req.created_at).getTime();
                              const isTakingLonger = ageMs > PROCESSING_LONGER_THRESHOLD_MS;

                              if (isTakingLonger) {
                                return (
                                  <div className="text-xs text-amber-600 mt-1">
                                    Processing longer than usual
                                  </div>
                                );
                              }

                              return (
                                <div className="text-xs text-slate-400 mt-1">
                                  {req.status === 'IN_REVIEW'
                                    ? `In review for ${formatProcessingTime(now - new Date(req.updated_at).getTime())}`
                                    : req.status === 'APPROVED'
                                    ? `Processing for ${formatProcessingTime(now - new Date(req.updated_at).getTime())}`
                                    : `Submitted ${formatProcessingTime(now - new Date(req.created_at).getTime())} ago`}
                                </div>
                              );
                            })()}
                            {req.status === 'CONVERTED' && (
                              <div className="text-xs text-slate-400 mt-1">
                                Completed
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {displayTime(req.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/client/requests/${req.request_id}`}
                              className={`text-sm ${accentText} hover:opacity-80 font-medium`}
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

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
