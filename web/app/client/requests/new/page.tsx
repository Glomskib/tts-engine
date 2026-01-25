'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import ClientNav from '../../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

interface AuthUser {
  id: string;
  email: string | null;
}

interface Project {
  project_id: string;
  project_name: string;
}

type RequestType = 'AI_CONTENT' | 'UGC_EDIT';

export default function NewRequestPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // Form state
  const [requestType, setRequestType] = useState<RequestType>('AI_CONTENT');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [ugcLinks, setUgcLinks] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/client/requests/new');
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/client/requests/new');
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

  // Fetch projects
  useEffect(() => {
    if (!authUser) return;

    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/client/projects');
        const data = await res.json();

        if (res.ok && data.ok) {
          setProjects(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      }
    };

    fetchProjects();
  }, [authUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!brief.trim()) {
      setError('Brief is required');
      return;
    }

    // Parse ugc_links for UGC_EDIT
    let parsedUgcLinks: string[] | undefined;
    if (requestType === 'UGC_EDIT') {
      const links = ugcLinks
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (links.length === 0) {
        setError('At least one footage link is required for UGC Edit requests');
        return;
      }
      parsedUgcLinks = links;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/client/requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_type: requestType,
          title: title.trim(),
          brief: brief.trim(),
          project_id: projectId || undefined,
          product_url: requestType === 'AI_CONTENT' && productUrl.trim() ? productUrl.trim() : undefined,
          ugc_links: parsedUgcLinks,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        router.push(`/client/requests/${data.data.request_id}`);
      } else {
        setError(data.message || data.error || 'Failed to create request');
      }
    } catch (err) {
      console.error('Failed to create request:', err);
      setError('Network error');
    } finally {
      setSubmitting(false);
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

  const accentText = branding?.accent_text_class || 'text-slate-800';
  const accentBg = branding?.accent_bg_class || 'bg-slate-800';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Header */}
        <div className="mb-6">
          <Link href="/client/requests" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
            &larr; Back to Requests
          </Link>
          <h1 className={`text-2xl font-semibold ${accentText}`}>New Request</h1>
          <p className="mt-1 text-sm text-slate-500">
            Submit a content request for your team.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Request Type Toggle */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Request Type
            </label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setRequestType('AI_CONTENT')}
                className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                  requestType === 'AI_CONTENT'
                    ? `border-slate-800 bg-slate-50`
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-medium text-slate-800">AI Content</div>
                <div className="text-sm text-slate-500 mt-1">
                  We create the video from your brief. No footage needed.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRequestType('UGC_EDIT')}
                className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                  requestType === 'UGC_EDIT'
                    ? `border-slate-800 bg-slate-50`
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-medium text-slate-800">UGC Edit</div>
                <div className="text-sm text-slate-500 mt-1">
                  You provide footage; we edit and polish it.
                </div>
              </button>
            </div>
          </div>

          {/* Main Form Fields */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-5">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Product Launch Video"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                maxLength={200}
              />
              <p className="text-xs text-slate-400 mt-1">A short, descriptive title for your request.</p>
            </div>

            {/* Brief */}
            <div>
              <label htmlFor="brief" className="block text-sm font-medium text-slate-700 mb-1">
                Brief <span className="text-red-500">*</span>
              </label>
              <textarea
                id="brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={5}
                placeholder={requestType === 'AI_CONTENT'
                  ? "Describe what you want the video to communicate. Include key messages, tone, target audience, and any specific requirements."
                  : "Describe how you want the footage edited. Include style preferences, key moments to highlight, and any text overlays or effects needed."
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                maxLength={5000}
              />
              <p className="text-xs text-slate-400 mt-1">
                The more detail you provide, the better we can match your vision.
              </p>
            </div>

            {/* AI_CONTENT: Product URL */}
            {requestType === 'AI_CONTENT' && (
              <div>
                <label htmlFor="productUrl" className="block text-sm font-medium text-slate-700 mb-1">
                  Product URL <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="url"
                  id="productUrl"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="https://example.com/product"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Link to the product or landing page for reference.
                </p>
              </div>
            )}

            {/* UGC_EDIT: Footage Links */}
            {requestType === 'UGC_EDIT' && (
              <div>
                <label htmlFor="ugcLinks" className="block text-sm font-medium text-slate-700 mb-1">
                  Footage Links <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="ugcLinks"
                  value={ugcLinks}
                  onChange={(e) => setUgcLinks(e.target.value)}
                  rows={4}
                  placeholder={"https://drive.google.com/file/...\nhttps://www.dropbox.com/s/..."}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Enter one link per line. Supported: Google Drive, Dropbox, or any accessible URL.
                </p>
              </div>
            )}

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
                Additional Notes <span className="text-slate-400">(optional)</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any other details or special instructions..."
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
              />
            </div>

            {/* Project Selection */}
            {projects.length > 0 && (
              <div>
                <label htmlFor="project" className="block text-sm font-medium text-slate-700 mb-1">
                  Project <span className="text-slate-400">(optional)</span>
                </label>
                <select
                  id="project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent bg-white"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.project_name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Associate this request with a project for organization.
                </p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Billing Note */}
          <div className="text-xs text-slate-400 text-center">
            Requests count toward your billing once approved and converted to video.
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/client/requests"
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className={`px-6 py-2 ${accentBg} text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
