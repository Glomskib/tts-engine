'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import IncidentBanner from './IncidentBanner';

type ClaimRole = 'recorder' | 'editor' | 'uploader' | 'admin';
type SlaStatus = 'on_track' | 'due_soon' | 'overdue';

interface VideoDetail {
  id: string;
  recording_status: string;
  script_locked_text: string | null;
  google_drive_url: string | null;
  final_video_url: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  recording_notes: string | null;
  editor_notes: string | null;
  uploader_notes: string | null;
  last_status_changed_at: string | null;
  // Assignment fields
  assigned_to: string | null;
  assigned_expires_at: string | null;
  assigned_role: string | null;
  assignment_state: string | null;
  // Computed SLA
  sla_status?: SlaStatus;
  age_minutes_in_stage?: number;
}

interface AuthUser {
  id: string;
  email: string | null;
  role: ClaimRole | null;
}

interface Notification {
  id: string;
  type: string;
  video_id: string | null;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

interface RoleWorkbenchProps {
  role: 'recorder' | 'editor' | 'uploader';
  title: string;
}

// SLA badge colors
function getSlaColor(status: SlaStatus): { bg: string; text: string; border: string } {
  switch (status) {
    case 'overdue':
      return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' };
    case 'due_soon':
      return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' };
    case 'on_track':
      return { bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0' };
    default:
      return { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' };
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'other'] as const;

// Role display colors
const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  recorder: { bg: '#dbeafe', text: '#1d4ed8' },
  editor: { bg: '#fef3c7', text: '#b45309' },
  uploader: { bg: '#dcfce7', text: '#15803d' },
};

export default function RoleWorkbench({ role, title }: RoleWorkbenchProps) {
  const hydrated = useHydrated();
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Form state
  const [recordingNotes, setRecordingNotes] = useState('');
  const [editorNotes, setEditorNotes] = useState('');
  const [uploaderNotes, setUploaderNotes] = useState('');
  const [finalVideoUrl, setFinalVideoUrl] = useState('');
  const [postedUrl, setPostedUrl] = useState('');
  const [postedPlatform, setPostedPlatform] = useState('');
  const [postedAccount, setPostedAccount] = useState('');

  // Action state
  const [submitting, setSubmitting] = useState(false);
  const [releasing, setReleasing] = useState(false);

  // Accordion state
  const [showScript, setShowScript] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [previousExpiredMessage, setPreviousExpiredMessage] = useState<string | null>(null);

  // Subscription gating state
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push(`/login?redirect=/admin/${role}/workbench`);
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        const userRole = roleData.role as ClaimRole | null;

        // Role validation: user must have matching role or be admin
        if (userRole !== 'admin' && userRole !== role) {
          if (userRole === 'recorder' || userRole === 'editor' || userRole === 'uploader') {
            router.push(`/admin/${userRole}/workbench`);
          } else {
            router.push('/admin/pipeline');
          }
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
          role: userRole,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push(`/login?redirect=/admin/${role}/workbench`);
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router, role]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10');
      const data = await res.json();
      if (data.ok && data.data) {
        setNotifications(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, []);

  // Poll notifications every 45 seconds
  useEffect(() => {
    if (!authUser) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 45000);
    return () => clearInterval(interval);
  }, [authUser, fetchNotifications]);

  // Fetch video data
  const fetchVideo = useCallback(async (videoId: string) => {
    try {
      const res = await fetch(`/api/videos/${videoId}`);
      const data = await res.json();

      if (data.ok && data.data) {
        const v = data.data as VideoDetail;
        setVideo(v);

        // Populate form with current values
        setRecordingNotes(v.recording_notes || '');
        setEditorNotes(v.editor_notes || '');
        setUploaderNotes(v.uploader_notes || '');
        setFinalVideoUrl(v.final_video_url || '');
        setPostedUrl(v.posted_url || '');
        setPostedPlatform(v.posted_platform || '');
        setError('');
      } else {
        setError(data.error || 'Failed to load video');
      }
    } catch (err) {
      setError('Network error');
    }
  }, []);

  // Load active assignment or dispatch
  const loadWork = useCallback(async () => {
    if (!authUser) return;

    setLoading(true);
    setVideo(null);
    setMessage(null);
    setPreviousExpiredMessage(null);
    setSubscriptionRequired(false);

    try {
      // First check for active assignment
      const activeRes = await fetch('/api/videos/my-active');
      const activeData = await activeRes.json();

      // Check if previous assignment expired
      if (activeData.previous_expired) {
        setPreviousExpiredMessage('Your previous assignment expired and was re-queued. Dispatching next task...');
      }

      if (activeData.ok && activeData.data?.video_id) {
        // Load the assigned video
        await fetchVideo(activeData.data.video_id);
        setLoading(false);
        return;
      }

      // No active assignment - dispatch next
      const dispatchRes = await fetch('/api/videos/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const dispatchData = await dispatchRes.json();

      if (dispatchData.ok && dispatchData.data?.video_id) {
        await fetchVideo(dispatchData.data.video_id);
        const expiresAt = new Date(dispatchData.data.assigned_expires_at);
        setMessage({
          type: 'success',
          text: `New work assigned until ${expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        });
      } else if (dispatchData.code === 'NO_WORK_AVAILABLE') {
        setError('');
        setVideo(null);
      } else if (dispatchData.error === 'subscription_required') {
        setSubscriptionRequired(true);
        setError('');
        setVideo(null);
      } else {
        setError(dispatchData.error || 'Failed to dispatch');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [authUser, role, fetchVideo]);

  useEffect(() => {
    if (authUser) {
      loadWork();
    }
  }, [authUser, loadWork]);

  // Calculate assignment time left
  const getAssignmentTimeLeft = (): number | null => {
    if (!video?.assigned_expires_at || video?.assignment_state !== 'ASSIGNED') return null;
    const expiresTime = new Date(video.assigned_expires_at).getTime();
    const now = Date.now();
    if (expiresTime <= now) return 0;
    return Math.floor((expiresTime - now) / (1000 * 60));
  };

  // Submit action based on role
  const handleSubmit = async () => {
    if (!video) return;

    setSubmitting(true);
    setMessage(null);

    try {
      let newStatus: string;
      const payload: Record<string, unknown> = {};

      if (role === 'recorder') {
        newStatus = 'RECORDED';
        payload.recording_notes = recordingNotes || null;
      } else if (role === 'editor') {
        // Editor can do EDITED or READY_TO_POST
        if (video.recording_status === 'RECORDED') {
          newStatus = 'EDITED';
        } else {
          newStatus = 'READY_TO_POST';
          // Validate final_video_url
          if (!finalVideoUrl.trim()) {
            setMessage({ type: 'error', text: 'Final video URL is required for Ready to Post' });
            setSubmitting(false);
            return;
          }
        }
        payload.editor_notes = editorNotes || null;
        if (finalVideoUrl.trim()) {
          payload.final_video_url = finalVideoUrl.trim();
        }
      } else {
        // Uploader
        newStatus = 'POSTED';
        // Validate required fields
        if (!postedUrl.trim()) {
          setMessage({ type: 'error', text: 'Posted URL is required' });
          setSubmitting(false);
          return;
        }
        if (!postedPlatform) {
          setMessage({ type: 'error', text: 'Platform is required' });
          setSubmitting(false);
          return;
        }
        payload.uploader_notes = uploaderNotes || null;
        payload.posted_url = postedUrl.trim();
        payload.posted_platform = postedPlatform;
        payload.posted_account = postedAccount || null;
      }

      payload.recording_status = newStatus;

      const res = await fetch(`/api/videos/${video.id}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.ok) {
        const nextRoleMsg = role === 'recorder' ? ' Handed off to editor.' :
                           role === 'editor' && newStatus === 'READY_TO_POST' ? ' Handed off to uploader.' : '';
        setMessage({
          type: 'success',
          text: `Marked as ${newStatus.replace(/_/g, ' ')}.${nextRoleMsg}`,
        });

        // Clear form
        setRecordingNotes('');
        setEditorNotes('');
        setUploaderNotes('');
        setFinalVideoUrl('');
        setPostedUrl('');
        setPostedPlatform('');
        setPostedAccount('');

        // Load next work after a short delay
        setTimeout(() => {
          loadWork();
        }, 1500);
      } else if (data.error === 'subscription_required') {
        setSubscriptionRequired(true);
        setMessage({ type: 'error', text: 'Upgrade required to submit status changes.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Release assignment
  const handleRelease = async () => {
    if (!video) return;

    setReleasing(true);
    setMessage(null);

    try {
      // Release claim if exists
      await fetch(`/api/videos/${video.id}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      setMessage({ type: 'success', text: 'Assignment released' });

      setTimeout(() => {
        loadWork();
      }, 1000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to release' });
    } finally {
      setReleasing(false);
    }
  };

  // Copy video ID
  const copyVideoId = async () => {
    if (!video) return;
    try {
      await navigator.clipboard.writeText(video.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Loading states
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
        <div className="text-slate-500">Redirecting...</div>
      </div>
    );
  }

  const timeLeft = getAssignmentTimeLeft();
  const roleColors = ROLE_COLORS[role] || { bg: '#f1f5f9', text: '#64748b' };

  // Get primary action button config
  const getPrimaryAction = () => {
    if (!video) return null;

    if (role === 'recorder') {
      return { label: 'Mark Recorded', color: '#2563eb' };
    } else if (role === 'editor') {
      if (video.recording_status === 'RECORDED') {
        return { label: 'Mark Edited', color: '#d97706' };
      } else {
        return { label: 'Mark Ready to Post', color: '#16a34a' };
      }
    } else {
      return { label: 'Mark Posted', color: '#7c3aed' };
    }
  };

  const primaryAction = getPrimaryAction();

  // Accordion component
  const Accordion = ({
    title,
    isOpen,
    onToggle,
    children,
    badge,
  }: {
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    badge?: string;
  }) => (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-slate-200 text-slate-600">{badge}</span>
          )}
        </div>
        <span className="text-slate-400">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="border-t border-slate-200">{children}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Incident Mode Banner */}
        <IncidentBanner />

        {/* Context Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-800">Workbench</h1>
              <span
                className="px-3 py-1 rounded-full text-sm font-medium capitalize"
                style={{ backgroundColor: roleColors.bg, color: roleColors.text }}
              >
                {role}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
              >
                Notifications
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center text-xs bg-red-500 text-white rounded-full">
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>
              <Link
                href={`/admin/${role}`}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-600"
              >
                Dashboard
              </Link>
            </div>
          </div>
          <div className="text-sm text-slate-500">
            {loading ? 'Loading...' : video ? 'Active task loaded' : 'No active task'}
            {video && timeLeft !== null && (
              <span className="ml-2">
                • <span className={timeLeft < 30 ? 'text-amber-600 font-medium' : 'text-slate-500'}>
                  {timeLeft > 0 ? `${formatDuration(timeLeft)} remaining` : 'Time expired'}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* User info bar */}
        <div className="mb-4 px-4 py-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{authUser.email || authUser.id.slice(0, 8)}</span>
            <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 capitalize">{authUser.role}</span>
          </div>
          <button
            onClick={async () => {
              const supabase = createBrowserSupabaseClient();
              await supabase.auth.signOut();
              router.push('/login');
            }}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Notifications panel */}
        {showNotifications && (
          <div className="mb-4 p-4 bg-white rounded-lg border border-slate-200 max-h-72 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-slate-700">Recent Notifications</span>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>
            {notifications.length === 0 ? (
              <div className="text-sm text-slate-400">No notifications</div>
            ) : (
              <div className="space-y-2">
                {notifications.map(notif => (
                  <div
                    key={notif.id}
                    className={`p-3 rounded-md text-sm ${notif.is_read ? 'bg-slate-50' : 'bg-blue-50 border border-blue-100'}`}
                  >
                    <div className={notif.is_read ? 'text-slate-600' : 'text-slate-800 font-medium'}>
                      {notif.type === 'assigned' && 'New assignment'}
                      {notif.type === 'assignment_expired' && 'Assignment expired'}
                      {notif.type === 'handoff' && 'Work handed off to you'}
                      {!['assigned', 'assignment_expired', 'handoff'].includes(notif.type) && notif.type}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {hydrated && formatDateString(notif.created_at)}
                      {notif.video_id && ` • ${notif.video_id.slice(0, 8)}...`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Previous expired message */}
        {previousExpiredMessage && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
            {previousExpiredMessage}
          </div>
        )}

        {/* Subscription required prompt */}
        {subscriptionRequired && (
          <div className="mb-4 p-6 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="text-lg font-semibold text-blue-800 mb-2">Upgrade Required</div>
            <div className="text-sm text-blue-600 mb-4">
              You need a Pro subscription to dispatch and complete tasks.
            </div>
            <Link
              href="/upgrade"
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
            >
              View Upgrade Options
            </Link>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="py-16 text-center">
            <div className="inline-block w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mb-4"></div>
            <div className="text-slate-500">Loading your next task...</div>
          </div>
        )}

        {/* Empty state - No work available */}
        {!loading && !video && !error && !subscriptionRequired && (
          <div className="py-16 text-center">
            <div className="max-w-sm mx-auto">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-2xl">✓</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">No work available</h2>
              <p className="text-slate-500 mb-6">
                You're all caught up. Check back soon or dispatch the next item.
              </p>
              <button
                onClick={loadWork}
                className="px-6 py-2.5 bg-slate-800 text-white rounded-md font-medium hover:bg-slate-700 transition-colors"
              >
                Dispatch Next
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-700 mb-2">{error}</div>
            <button
              onClick={loadWork}
              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Current Task Card */}
        {video && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Card Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500">Current Task</span>
                  <span className="font-mono text-sm text-slate-700">{video.id.slice(0, 8)}...</span>
                  <button
                    onClick={copyVideoId}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      copiedId
                        ? 'bg-green-500 text-white border-green-500'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {copiedId ? 'Copied!' : 'Copy ID'}
                  </button>
                  <Link
                    href={`/admin/pipeline/${video.id}`}
                    target="_blank"
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Full Details →
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  {/* Status chip */}
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                    {video.recording_status?.replace(/_/g, ' ') || 'NOT RECORDED'}
                  </span>
                  {/* Time left chip */}
                  {timeLeft !== null && (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      timeLeft < 30
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {timeLeft > 0 ? `${formatDuration(timeLeft)} left` : 'Expired'}
                    </span>
                  )}
                  {/* SLA chip */}
                  {video.sla_status && (
                    <span
                      className="px-3 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: getSlaColor(video.sla_status).bg,
                        color: getSlaColor(video.sla_status).text
                      }}
                    >
                      {video.sla_status.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>
              {/* Time in stage */}
              {video.age_minutes_in_stage !== undefined && (
                <div className="mt-2 text-xs text-slate-400">
                  Time in stage: {formatDuration(video.age_minutes_in_stage)}
                </div>
              )}
            </div>

            {/* Required Fields Section */}
            <div className="px-6 py-5">
              <div className="mb-4">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Required Fields</span>
              </div>

              {/* Recorder form */}
              {role === 'recorder' && (
                <div>
                  <label className="block mb-1.5 text-sm font-medium text-slate-700">
                    Recording Notes <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={recordingNotes}
                    onChange={(e) => setRecordingNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={3}
                    placeholder="Any notes about the recording..."
                  />
                </div>
              )}

              {/* Editor form */}
              {role === 'editor' && (
                <div className="space-y-4">
                  {video.recording_status === 'EDITED' && (
                    <div>
                      <label className="block mb-1.5 text-sm font-medium text-slate-700">
                        Final Video URL <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={finalVideoUrl}
                        onChange={(e) => setFinalVideoUrl(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="https://..."
                      />
                    </div>
                  )}
                  <div>
                    <label className="block mb-1.5 text-sm font-medium text-slate-700">
                      Editor Notes <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={editorNotes}
                      onChange={(e) => setEditorNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                      placeholder="Any notes about the editing..."
                    />
                  </div>
                </div>
              )}

              {/* Uploader form */}
              {role === 'uploader' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1.5 text-sm font-medium text-slate-700">
                        Platform <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={postedPlatform}
                        onChange={(e) => setPostedPlatform(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      >
                        <option value="">Select platform</option>
                        {PLATFORMS.map(p => (
                          <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1.5 text-sm font-medium text-slate-700">
                        Account/Handle <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={postedAccount}
                        onChange={(e) => setPostedAccount(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="@username"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-sm font-medium text-slate-700">
                      Posted URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={postedUrl}
                      onChange={(e) => setPostedUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block mb-1.5 text-sm font-medium text-slate-700">
                      Uploader Notes <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={uploaderNotes}
                      onChange={(e) => setUploaderNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={2}
                      placeholder="Any notes about the posting..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Primary CTA */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
              {primaryAction && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || subscriptionRequired}
                  className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: (submitting || subscriptionRequired) ? '#94a3b8' : primaryAction.color
                  }}
                >
                  {submitting ? 'Submitting...' : subscriptionRequired ? 'Upgrade Required' : primaryAction.label}
                </button>
              )}
            </div>

            {/* Collapsible Sections */}
            <div className="px-6 py-4 space-y-3 border-t border-slate-100">
              {/* Script accordion */}
              {video.script_locked_text && (
                <Accordion
                  title="Script (locked)"
                  isOpen={showScript}
                  onToggle={() => setShowScript(!showScript)}
                  badge="Read-only"
                >
                  <pre className="p-4 bg-white text-sm font-mono whitespace-pre-wrap max-h-64 overflow-auto text-slate-700">
                    {video.script_locked_text}
                  </pre>
                </Accordion>
              )}

              {/* Notes accordion - show if there are existing notes to display */}
              {(video.recording_notes || video.editor_notes || video.uploader_notes) && (
                <Accordion
                  title="Notes / Details"
                  isOpen={showNotes}
                  onToggle={() => setShowNotes(!showNotes)}
                >
                  <div className="p-4 space-y-3 text-sm">
                    {video.recording_notes && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">Recording Notes</div>
                        <div className="text-slate-700">{video.recording_notes}</div>
                      </div>
                    )}
                    {video.editor_notes && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">Editor Notes</div>
                        <div className="text-slate-700">{video.editor_notes}</div>
                      </div>
                    )}
                    {video.uploader_notes && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">Uploader Notes</div>
                        <div className="text-slate-700">{video.uploader_notes}</div>
                      </div>
                    )}
                  </div>
                </Accordion>
              )}

              {/* Advanced accordion */}
              <Accordion
                title="Advanced"
                isOpen={showAdvanced}
                onToggle={() => setShowAdvanced(!showAdvanced)}
              >
                <div className="p-4">
                  <button
                    onClick={handleRelease}
                    disabled={releasing}
                    className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {releasing ? 'Releasing...' : 'Release Assignment'}
                  </button>
                  <p className="mt-2 text-xs text-slate-400">
                    Release this task back to the queue without completing it.
                  </p>
                </div>
              </Accordion>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400">
          {role.charAt(0).toUpperCase() + role.slice(1)} Workbench • Single-task focus mode
        </div>
      </div>
    </div>
  );
}
