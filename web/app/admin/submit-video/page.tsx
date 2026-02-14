'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useIsVideoClient } from '@/hooks/useFeatureAccess';
import {
  Video,
  FileText,
  Mic,
  Upload,
  Calendar,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface AuthUser {
  id: string;
  email: string | null;
}

interface Script {
  id: string;
  title: string;
  created_at: string;
}

type ContentType = 'scripted' | 'freestyle' | 'existing';

const CONTENT_TYPES: {
  id: ContentType;
  name: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    id: 'scripted',
    name: 'With Script',
    description: 'AI-generated or written script to follow',
    icon: FileText,
  },
  {
    id: 'freestyle',
    name: 'Freestyle',
    description: 'Speaking freely without a script',
    icon: Mic,
  },
  {
    id: 'existing',
    name: 'Existing Content',
    description: 'Pre-recorded footage for editing',
    icon: Video,
  },
];

const PRIORITY_OPTIONS = [
  { value: 0, label: 'Normal', description: 'Standard turnaround time' },
  { value: 1, label: 'High', description: 'Prioritized in editing queue' },
  { value: 2, label: 'Urgent', description: 'Rush delivery (if available)' },
];

export default function SubmitVideoPage() {
  const router = useRouter();
  const { isVideoClient, loading: accessLoading } = useIsVideoClient();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [videosRemaining, setVideosRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceDriveLink, setSourceDriveLink] = useState('');
  const [contentType, setContentType] = useState<ContentType>('scripted');
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState('');

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/submit-video');
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/submit-video');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch user's scripts
  useEffect(() => {
    if (!authUser) return;

    const fetchScripts = async () => {
      setScriptsLoading(true);
      try {
        const res = await fetch('/api/scripts?limit=100');
        const data = await res.json();

        if (res.ok && data.ok) {
          setScripts(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch scripts:', err);
      } finally {
        setScriptsLoading(false);
      }
    };

    fetchScripts();
  }, [authUser]);

  // Fetch videos remaining
  useEffect(() => {
    if (!authUser) return;

    const fetchQuota = async () => {
      try {
        const res = await fetch('/api/video-requests?limit=1');
        const data = await res.json();

        if (res.ok && data.ok) {
          setVideosRemaining(data.data?.videosRemaining ?? null);
        }
      } catch (err) {
        console.error('Failed to fetch quota:', err);
      }
    };

    fetchQuota();
  }, [authUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/video-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          source_drive_link: sourceDriveLink,
          content_type: contentType,
          script_id: contentType === 'scripted' ? scriptId : null,
          priority,
          due_date: dueDate || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setSuccess(true);
      setVideosRemaining(data.videosRemaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || accessLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!authUser) {
    return null;
  }

  if (!isVideoClient) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Video Editing Access Required</h1>
          <p className="text-zinc-400 text-sm mb-6">
            Video submission is available for video editing subscribers. Upgrade to start submitting videos for professional editing.
          </p>
          <Link
            href="/upgrade"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-colors"
          >
            View Plans
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Request Submitted!</h1>
          <p className="text-zinc-400 text-sm mb-4">
            Your video editing request has been received. Our team will begin work shortly.
          </p>
          {videosRemaining !== null && (
            <p className="text-sm text-zinc-500 mb-6">
              {videosRemaining} video{videosRemaining !== 1 ? 's' : ''} remaining this month
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <button type="button"
              onClick={() => {
                setSuccess(false);
                setTitle('');
                setDescription('');
                setSourceDriveLink('');
                setContentType('scripted');
                setScriptId(null);
                setPriority(0);
                setDueDate('');
              }}
              className="px-4 py-2 rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5 transition-colors text-sm"
            >
              Submit Another
            </button>
            <Link
              href="/admin/content-studio"
              className="px-4 py-2 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-colors text-sm"
            >
              View Requests
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/content-studio"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-white">Submit Video Request</h1>
            <p className="text-sm text-zinc-400">
              Upload footage and we&apos;ll handle the editing
            </p>
          </div>
        </div>

        {/* Quota indicator */}
        {videosRemaining !== null && (
          <div className="mb-6 p-4 rounded-xl bg-zinc-900 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Videos remaining this month</span>
              <span className={`text-lg font-semibold ${videosRemaining > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {videosRemaining}
              </span>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Content Type Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Content Type *
            </label>
            <div className="grid grid-cols-3 gap-3">
              {CONTENT_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = contentType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setContentType(type.id);
                      if (type.id !== 'scripted') {
                        setScriptId(null);
                      }
                    }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-white/10 border-teal-500/50 ring-1 ring-teal-500/50'
                        : 'bg-zinc-900 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-teal-400' : 'text-zinc-500'}`} />
                    <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                      {type.name}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">{type.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Script Selection (only for scripted content) */}
          {contentType === 'scripted' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Link Script (Optional)
              </label>
              <select
                value={scriptId || ''}
                onChange={(e) => setScriptId(e.target.value || null)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm"
                disabled={scriptsLoading}
              >
                <option value="">No script linked</option>
                {scripts.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.title}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-zinc-500">
                Link a script from your library for the editor to reference
              </p>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm"
              placeholder="e.g., Product demo - Blue Widget"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm resize-none"
              placeholder="Any notes for the editor: style preferences, pacing, etc."
            />
          </div>

          {/* Source Drive Link */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Source Footage Link *
            </label>
            <div className="relative">
              <Upload className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="url"
                required
                value={sourceDriveLink}
                onChange={(e) => setSourceDriveLink(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm"
                placeholder="https://drive.google.com/..."
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Google Drive, Dropbox, or any accessible link to your footage
            </p>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value))}
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              <Calendar className="inline w-4 h-4 mr-1" />
              Preferred Due Date (Optional)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || (videosRemaining !== null && videosRemaining <= 0)}
            className="w-full py-4 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : videosRemaining !== null && videosRemaining <= 0 ? (
              'No Videos Remaining'
            ) : (
              <>
                <Video className="w-5 h-5" />
                Submit Request
              </>
            )}
          </button>

          {videosRemaining !== null && videosRemaining <= 0 && (
            <p className="text-center text-sm text-zinc-500">
              <Link href="/upgrade" className="text-teal-400 hover:underline">
                Upgrade your plan
              </Link>{' '}
              to submit more videos
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
