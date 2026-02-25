'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle2, ExternalLink, FolderOpen, Loader2
} from 'lucide-react';
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

interface RecentRequest {
  id: string;
  title: string;
  created_at: string;
  status: string;
}

type RequestType = 'AI_CONTENT' | 'UGC_EDIT';

// Classify pasted URLs
function classifyUrl(url: string): 'drive_folder' | 'drive_file' | 'dropbox' | 'url' | null {
  if (!url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (host.includes('drive.google.com')) {
      return parsed.pathname.includes('/folders/') ? 'drive_folder' : 'drive_file';
    }
    if (host.includes('dropbox.com')) return 'dropbox';
    return 'url';
  } catch {
    return null;
  }
}

function getUrlBadge(type: ReturnType<typeof classifyUrl>) {
  switch (type) {
    case 'drive_folder': return { label: 'Drive Folder', color: 'bg-green-100 text-green-700' };
    case 'drive_file': return { label: 'Drive File', color: 'bg-blue-100 text-blue-700' };
    case 'dropbox': return { label: 'Dropbox', color: 'bg-indigo-100 text-indigo-700' };
    case 'url': return { label: 'URL', color: 'bg-slate-100 text-slate-600' };
    default: return null;
  }
}

export default function NewRequestPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);

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

  // Preview mode
  const [showPreview, setShowPreview] = useState(false);

  // Duplicate detection
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const dupCheckTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  // Fetch branding + projects + recent requests
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

    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/client/projects');
        const data = await res.json();
        if (res.ok && data.ok) {
          setProjects(data.data || []);
        }
      } catch {
        // ignore
      }
    };

    const fetchRecent = async () => {
      try {
        const res = await fetch('/api/client/my-videos?limit=20');
        const data = await res.json();
        if (data.ok) {
          setRecentRequests(data.data || []);
        }
      } catch {
        // ignore
      }
    };

    fetchBranding();
    fetchProjects();
    fetchRecent();
  }, [authUser]);

  // Duplicate title check (debounced)
  const checkDuplicate = useCallback((newTitle: string) => {
    if (dupCheckTimeout.current) clearTimeout(dupCheckTimeout.current);

    if (!newTitle.trim() || recentRequests.length === 0) {
      setDuplicateWarning(null);
      return;
    }

    dupCheckTimeout.current = setTimeout(() => {
      const normalized = newTitle.trim().toLowerCase();
      const match = recentRequests.find(r =>
        r.title.toLowerCase() === normalized && !['completed', 'cancelled'].includes(r.status)
      );
      if (match) {
        const when = new Date(match.created_at).toLocaleDateString();
        setDuplicateWarning(`You have an active request with this exact title (submitted ${when}).`);
      } else {
        setDuplicateWarning(null);
      }
    }, 400);
  }, [recentRequests]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    checkDuplicate(val);
  };

  // Smart paste handler for UGC links
  const handleUgcPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    // If it's a drive folder link, auto-add with newline
    if (text.includes('drive.google.com/drive/folders/')) {
      e.preventDefault();
      const current = ugcLinks.trim();
      setUgcLinks(current ? `${current}\n${text.trim()}` : text.trim());
    }
  };

  // Validate form
  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Title is required');
    if (!brief.trim()) errors.push('Brief is required');
    if (requestType === 'UGC_EDIT') {
      const links = ugcLinks.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (links.length === 0) {
        errors.push('At least one footage link is required for UGC Edit requests');
      }
    }
    return errors;
  };

  const isFormValid = getValidationErrors().length === 0;

  // Parsed links for preview
  const parsedLinks = ugcLinks
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => ({ url: l, type: classifyUrl(l) }));

  const handleReviewAndSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = getValidationErrors();
    if (errors.length > 0) {
      setError(errors.join('. '));
      return;
    }
    setError('');
    setShowPreview(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setError('');

    const parsedUgcLinks = requestType === 'UGC_EDIT'
      ? ugcLinks.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      : undefined;

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
      } else if (res.status === 409) {
        setError(data.message || 'A duplicate request was detected. Please wait or change your title.');
        setShowPreview(false);
      } else {
        setError(data.message || data.error || 'Failed to create request');
        setShowPreview(false);
      }
    } catch {
      setError('Network error');
      setShowPreview(false);
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

  // Preview card
  if (showPreview) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <ClientNav userName={authUser.email || undefined} branding={branding} />

          <div className="mb-6">
            <h1 className={`text-2xl font-semibold ${accentText}`}>Review Before Submitting</h1>
            <p className="mt-1 text-sm text-slate-500">
              Please confirm these details are correct.
            </p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-6">
            {/* Summary header */}
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                  {requestType === 'AI_CONTENT' ? 'AI Content' : 'UGC Edit'}
                </span>
              </div>
              <p className="text-sm text-slate-500">
                Estimated SLA: <span className="font-medium text-slate-700">24-48 hours</span> after editor assignment
              </p>
            </div>

            {/* Brief */}
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-sm font-medium text-slate-500 mb-1">Brief</h3>
              <p className="text-slate-800 whitespace-pre-wrap text-sm">{brief}</p>
            </div>

            {/* Links */}
            {requestType === 'UGC_EDIT' && parsedLinks.length > 0 && (
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-sm font-medium text-slate-500 mb-2">Footage Links</h3>
                <div className="space-y-2">
                  {parsedLinks.map((link, idx) => {
                    const badge = getUrlBadge(link.type);
                    return (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        {badge && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
                            {link.type === 'drive_folder' && <FolderOpen className="w-3 h-3 inline mr-1" />}
                            {badge.label}
                          </span>
                        )}
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 truncate flex items-center gap-1">
                          {link.url}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {requestType === 'AI_CONTENT' && productUrl.trim() && (
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Product URL</h3>
                <a href={productUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-600 hover:text-teal-800 flex items-center gap-1">
                  {productUrl}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {notes.trim() && (
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-sm font-medium text-slate-500 mb-1">Notes</h3>
                <p className="text-slate-800 text-sm whitespace-pre-wrap">{notes}</p>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-6">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={submitting}
              className={`px-6 py-2.5 ${accentBg} text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm & Submit
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        <form onSubmit={handleReviewAndSubmit} className="space-y-6">
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
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g., Product Launch Video"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                  duplicateWarning ? 'border-amber-400 focus:ring-amber-400' : 'border-slate-300 focus:ring-slate-400'
                }`}
                maxLength={200}
              />
              {duplicateWarning ? (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {duplicateWarning}
                </p>
              ) : (
                <p className="text-xs text-slate-400 mt-1">A short, descriptive title for your request.</p>
              )}
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

            {/* UGC_EDIT: Footage Links with smart parsing */}
            {requestType === 'UGC_EDIT' && (
              <div>
                <label htmlFor="ugcLinks" className="block text-sm font-medium text-slate-700 mb-1">
                  Footage Links <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="ugcLinks"
                  value={ugcLinks}
                  onChange={(e) => setUgcLinks(e.target.value)}
                  onPaste={handleUgcPaste}
                  rows={4}
                  placeholder={"Paste Google Drive folder or file links, one per line\nhttps://drive.google.com/drive/folders/...\nhttps://drive.google.com/file/d/..."}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                />
                {/* Smart URL badges */}
                {parsedLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {parsedLinks.map((link, idx) => {
                      const badge = getUrlBadge(link.type);
                      if (!badge) return null;
                      return (
                        <span key={idx} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
                          {link.type === 'drive_folder' && <FolderOpen className="w-3 h-3" />}
                          {badge.label}
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Enter one link per line. Drive folders are auto-detected.
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

          {/* Submit — right-aligned */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/client/requests"
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!isFormValid}
              className={`px-6 py-2.5 ${accentBg} text-white text-sm font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Review & Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
