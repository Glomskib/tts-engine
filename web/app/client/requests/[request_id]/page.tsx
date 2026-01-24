'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import ClientNav from '../../components/ClientNav';
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

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SUBMITTED: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  IN_REVIEW: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  APPROVED: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  REJECTED: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  CONVERTED: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CONVERTED: 'Converted to Video',
};

const TYPE_LABELS: Record<string, string> = {
  AI_CONTENT: 'AI Content',
  UGC_EDIT: 'UGC Edit',
};

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

  // Fetch authenticated user
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

  // Fetch request
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
          <div className="text-center py-12 text-slate-500">Loading request...</div>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <ClientNav userName={authUser.email || undefined} branding={branding} />
          <div className="mb-6">
            <Link href="/client/requests" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
              &larr; Back to Requests
            </Link>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <div className="text-red-700 font-medium">{error || 'Request not found'}</div>
          </div>
        </div>
      </div>
    );
  }

  const statusColors = STATUS_COLORS[request.status] || STATUS_COLORS.SUBMITTED;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Header */}
        <div className="mb-6">
          <Link href="/client/requests" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
            &larr; Back to Requests
          </Link>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className={`text-2xl font-semibold ${accentText}`}>{request.title}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {TYPE_LABELS[request.request_type] || request.request_type}
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>
              {STATUS_LABELS[request.status] || request.status}
            </div>
          </div>
        </div>

        {/* Status Banner for special states */}
        {request.status === 'CONVERTED' && request.video_id && (
          <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="text-purple-700 font-medium">Video Created</div>
              <Link
                href={`/client/videos/${request.video_id}`}
                className="text-sm text-purple-600 hover:text-purple-800 underline"
              >
                View Video &rarr;
              </Link>
            </div>
          </div>
        )}

        {request.status === 'REJECTED' && request.status_reason && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-red-700 font-medium mb-1">Rejected</div>
            <div className="text-sm text-red-600">{request.status_reason}</div>
          </div>
        )}

        {/* Request Details */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm divide-y divide-slate-100">
          {/* Brief */}
          <div className="p-6">
            <div className="text-sm font-medium text-slate-500 mb-2">Brief</div>
            <div className="text-slate-800 whitespace-pre-wrap">{request.brief}</div>
          </div>

          {/* Product URL (for AI_CONTENT) */}
          {request.request_type === 'AI_CONTENT' && request.product_url && (
            <div className="p-6">
              <div className="text-sm font-medium text-slate-500 mb-2">Product URL</div>
              <a
                href={request.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm ${accentText} hover:underline`}
              >
                {request.product_url}
              </a>
            </div>
          )}

          {/* Footage Links (for UGC_EDIT) */}
          {request.request_type === 'UGC_EDIT' && request.ugc_links && request.ugc_links.length > 0 && (
            <div className="p-6">
              <div className="text-sm font-medium text-slate-500 mb-2">Footage Links</div>
              <ul className="space-y-1">
                {request.ugc_links.map((link, i) => (
                  <li key={i}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-sm ${accentText} hover:underline break-all`}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
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
                <div className="text-slate-500">Last Updated</div>
                <div className="text-slate-700">
                  {hydrated ? formatDateString(request.updated_at) : request.updated_at.split('T')[0]}
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
