'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

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
      return { bg: '#ffe3e3', text: '#c92a2a', border: '#ffa8a8' };
    case 'due_soon':
      return { bg: '#fff3bf', text: '#e67700', border: '#ffd43b' };
    case 'on_track':
      return { bg: '#d3f9d8', text: '#2b8a3e', border: '#69db7c' };
    default:
      return { bg: '#f8f9fa', text: '#495057', border: '#dee2e6' };
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
  const [showScript, setShowScript] = useState(true);

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

      // Clear assignment by completing it (or you could add a release-assignment endpoint)
      // For now, we'll just reload to get next work
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
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  const timeLeft = getAssignmentTimeLeft();

  // Get primary action button config
  const getPrimaryAction = () => {
    if (!video) return null;

    if (role === 'recorder') {
      return {
        label: 'Mark Recorded',
        color: '#228be6',
      };
    } else if (role === 'editor') {
      if (video.recording_status === 'RECORDED') {
        return {
          label: 'Mark Edited',
          color: '#fab005',
        };
      } else {
        return {
          label: 'Mark Ready to Post',
          color: '#40c057',
        };
      }
    } else {
      return {
        label: 'Mark Posted',
        color: '#1971c2',
      };
    }
  };

  const primaryAction = getPrimaryAction();

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link
            href={`/admin/${role}`}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '13px',
            }}
          >
            Dashboard
          </Link>
        </div>
      </div>

      {/* User info */}
      <div style={{
        marginBottom: '20px',
        padding: '10px 15px',
        backgroundColor: '#e7f5ff',
        borderRadius: '4px',
        border: '1px solid #74c0fc',
        fontSize: '13px',
      }}>
        <strong>{authUser.email || authUser.id.slice(0, 8)}</strong>
        <span style={{
          marginLeft: '10px',
          padding: '2px 8px',
          backgroundColor: '#fff',
          borderRadius: '4px',
          textTransform: 'capitalize',
        }}>
          {role}
        </span>
        <button
          onClick={async () => {
            const supabase = createBrowserSupabaseClient();
            await supabase.auth.signOut();
            router.push('/login');
          }}
          style={{
            marginLeft: '15px',
            padding: '3px 8px',
            backgroundColor: 'transparent',
            border: '1px solid #74c0fc',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Sign Out
        </button>
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          style={{
            marginLeft: '10px',
            padding: '3px 10px',
            backgroundColor: notifications.some(n => !n.is_read) ? '#fff3bf' : 'transparent',
            border: '1px solid #74c0fc',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Notifications ({notifications.filter(n => !n.is_read).length})
        </button>
      </div>

      {/* Notifications panel */}
      {showNotifications && (
        <div style={{
          marginBottom: '15px',
          padding: '12px 16px',
          backgroundColor: '#fff',
          borderRadius: '4px',
          border: '1px solid #dee2e6',
          maxHeight: '300px',
          overflow: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <strong>Recent Notifications</strong>
            <button
              onClick={() => setShowNotifications(false)}
              style={{
                padding: '2px 8px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Close
            </button>
          </div>
          {notifications.length === 0 ? (
            <div style={{ color: '#6c757d', fontSize: '13px' }}>No notifications</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {notifications.map(notif => (
                <div
                  key={notif.id}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: notif.is_read ? '#f8f9fa' : '#e7f5ff',
                    borderRadius: '4px',
                    border: `1px solid ${notif.is_read ? '#dee2e6' : '#74c0fc'}`,
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: notif.is_read ? 'normal' : 'bold' }}>
                    {notif.type === 'assigned' && 'New assignment'}
                    {notif.type === 'assignment_expired' && 'Assignment expired'}
                    {notif.type === 'handoff' && 'Work handed off to you'}
                    {!['assigned', 'assignment_expired', 'handoff'].includes(notif.type) && notif.type}
                  </div>
                  <div style={{ color: '#6c757d', fontSize: '11px', marginTop: '2px' }}>
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
        <div style={{
          marginBottom: '15px',
          padding: '12px 16px',
          backgroundColor: '#fff3bf',
          color: '#e67700',
          borderRadius: '4px',
          border: '1px solid #ffd43b',
        }}>
          {previousExpiredMessage}
        </div>
      )}

      {/* Subscription required prompt */}
      {subscriptionRequired && (
        <div style={{
          marginBottom: '15px',
          padding: '20px',
          backgroundColor: '#e7f5ff',
          borderRadius: '8px',
          border: '2px solid #228be6',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1971c2', marginBottom: '10px' }}>
            Upgrade Required
          </div>
          <div style={{ color: '#495057', marginBottom: '15px' }}>
            You need a Pro subscription to dispatch and complete tasks.
          </div>
          <Link
            href="/upgrade"
            style={{
              padding: '12px 24px',
              backgroundColor: '#228be6',
              color: 'white',
              borderRadius: '4px',
              display: 'inline-block',
              fontWeight: 'bold',
              textDecoration: 'none',
            }}
          >
            View Upgrade Options
          </Link>
        </div>
      )}

      {/* Message */}
      {message && (
        <div style={{
          marginBottom: '15px',
          padding: '12px 16px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          borderRadius: '4px',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          Loading your next task...
        </div>
      )}

      {/* No work available */}
      {!loading && !video && !error && !subscriptionRequired && (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#d3f9d8',
          borderRadius: '8px',
          border: '1px solid #69db7c',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2b8a3e', marginBottom: '10px' }}>
            No work available
          </div>
          <div style={{ color: '#37b24d', marginBottom: '20px' }}>
            All caught up! Check back later for new tasks.
          </div>
          <button
            onClick={loadWork}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Dispatch Next
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '20px',
          backgroundColor: '#f8d7da',
          borderRadius: '4px',
          color: '#721c24',
          marginBottom: '20px',
        }}>
          {error}
          <button
            onClick={loadWork}
            style={{
              marginLeft: '15px',
              padding: '6px 12px',
              backgroundColor: '#721c24',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Task Card */}
      {video && (
        <div style={{
          border: '2px solid #228be6',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '15px 20px',
            backgroundColor: '#e7f5ff',
            borderBottom: '1px solid #74c0fc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                {video.id.slice(0, 8)}...
              </span>
              <button
                onClick={copyVideoId}
                style={{
                  padding: '4px 8px',
                  backgroundColor: copiedId ? '#28a745' : '#fff',
                  color: copiedId ? 'white' : '#333',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {copiedId ? 'Copied!' : 'Copy ID'}
              </button>
              <Link
                href={`/admin/pipeline/${video.id}`}
                target="_blank"
                style={{ fontSize: '12px', color: '#228be6' }}
              >
                Full Details
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              {/* Status badge */}
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#fff',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>
                {video.recording_status?.replace(/_/g, ' ') || 'NOT RECORDED'}
              </span>
              {/* Assignment time */}
              {timeLeft !== null && (
                <span style={{
                  padding: '4px 10px',
                  backgroundColor: timeLeft < 30 ? '#fff3bf' : '#d3f9d8',
                  color: timeLeft < 30 ? '#e67700' : '#2b8a3e',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}>
                  {timeLeft > 0 ? `${formatDuration(timeLeft)} left` : 'Expired'}
                </span>
              )}
            </div>
          </div>

          {/* Script section */}
          {video.script_locked_text && (
            <div style={{ borderBottom: '1px solid #dee2e6' }}>
              <button
                onClick={() => setShowScript(!showScript)}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  backgroundColor: '#f8f9fa',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                <span>Script</span>
                <span>{showScript ? '▼' : '▶'}</span>
              </button>
              {showScript && (
                <pre style={{
                  margin: 0,
                  padding: '15px 20px',
                  backgroundColor: '#fff',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  maxHeight: '300px',
                  overflow: 'auto',
                }}>
                  {video.script_locked_text}
                </pre>
              )}
            </div>
          )}

          {/* Form section */}
          <div style={{ padding: '20px' }}>
            {/* Recorder form */}
            {role === 'recorder' && (
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Recording Notes (optional)
                </label>
                <textarea
                  value={recordingNotes}
                  onChange={(e) => setRecordingNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    minHeight: '80px',
                    resize: 'vertical',
                  }}
                  placeholder="Any notes about the recording..."
                />
              </div>
            )}

            {/* Editor form */}
            {role === 'editor' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Editor Notes (optional)
                  </label>
                  <textarea
                    value={editorNotes}
                    onChange={(e) => setEditorNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      minHeight: '80px',
                      resize: 'vertical',
                    }}
                    placeholder="Any notes about the editing..."
                  />
                </div>
                {video.recording_status === 'EDITED' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      Final Video URL <span style={{ color: '#dc3545' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={finalVideoUrl}
                      onChange={(e) => setFinalVideoUrl(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                      placeholder="https://..."
                    />
                  </div>
                )}
              </div>
            )}

            {/* Uploader form */}
            {role === 'uploader' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      Platform <span style={{ color: '#dc3545' }}>*</span>
                    </label>
                    <select
                      value={postedPlatform}
                      onChange={(e) => setPostedPlatform(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                    >
                      <option value="">-- Select --</option>
                      {PLATFORMS.map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      Account/Handle
                    </label>
                    <input
                      type="text"
                      value={postedAccount}
                      onChange={(e) => setPostedAccount(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                      placeholder="@username"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Posted URL <span style={{ color: '#dc3545' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={postedUrl}
                    onChange={(e) => setPostedUrl(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Uploader Notes (optional)
                  </label>
                  <textarea
                    value={uploaderNotes}
                    onChange={(e) => setUploaderNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      minHeight: '60px',
                      resize: 'vertical',
                    }}
                    placeholder="Any notes about the posting..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{
            padding: '15px 20px',
            backgroundColor: '#f8f9fa',
            borderTop: '1px solid #dee2e6',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}>
            <button
              onClick={handleRelease}
              disabled={releasing}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: releasing ? 'not-allowed' : 'pointer',
              }}
            >
              {releasing ? 'Releasing...' : 'Release Assignment'}
            </button>

            {primaryAction && (
              <button
                onClick={handleSubmit}
                disabled={submitting || subscriptionRequired}
                title={subscriptionRequired ? 'Upgrade to Pro to perform this action' : undefined}
                style={{
                  padding: '12px 30px',
                  backgroundColor: (submitting || subscriptionRequired) ? '#adb5bd' : primaryAction.color,
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (submitting || subscriptionRequired) ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '16px',
                }}
              >
                {submitting ? 'Submitting...' : subscriptionRequired ? 'Upgrade Required' : primaryAction.label}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', color: '#999', fontSize: '12px', textAlign: 'center' }}>
        {role.charAt(0).toUpperCase() + role.slice(1)} Workbench • Single-task focus mode
      </div>
    </div>
  );
}
