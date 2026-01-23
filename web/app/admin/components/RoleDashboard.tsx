'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type ClaimRole = 'recorder' | 'editor' | 'uploader' | 'admin';
type SlaStatus = 'on_track' | 'due_soon' | 'overdue';

interface QueueVideo {
  id: string;
  variant_id: string;
  account_id: string;
  status: string;
  google_drive_url: string;
  created_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  claim_role: string | null;
  recording_status: string | null;
  last_status_changed_at: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  script_locked_text: string | null;
  script_locked_version: number | null;
  // Computed fields
  can_move_next: boolean;
  blocked_reason: string | null;
  next_action: string;
  next_status: string | null;
  can_record: boolean;
  can_mark_edited: boolean;
  can_mark_ready_to_post: boolean;
  can_mark_posted: boolean;
  required_fields: string[];
  // SLA fields
  sla_deadline_at: string | null;
  sla_status: SlaStatus;
  age_minutes_in_stage: number;
  priority_score: number;
}

interface AuthUser {
  id: string;
  email: string | null;
  role: ClaimRole | null;
}

interface RoleDashboardProps {
  role: 'recorder' | 'editor' | 'uploader';
  title: string;
  filterFn: (video: QueueVideo) => boolean;
  defaultRecordingStatus?: string;
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

export default function RoleDashboard({ role, title, filterFn, defaultRecordingStatus }: RoleDashboardProps) {
  const hydrated = useHydrated();
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [videos, setVideos] = useState<QueueVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Filters
  const [myWorkOnly, setMyWorkOnly] = useState(true); // Default ON for role dashboards
  const [showUnclaimed, setShowUnclaimed] = useState(false);

  // Action states
  const [claimingVideoId, setClaimingVideoId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ videoId: string; message: string } | null>(null);

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push(`/login?redirect=/admin/${role}`);
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        const userRole = roleData.role as ClaimRole | null;

        // Role validation: user must have matching role or be admin
        if (userRole !== 'admin' && userRole !== role) {
          // Redirect to appropriate dashboard or pipeline
          if (userRole === 'recorder' || userRole === 'editor' || userRole === 'uploader') {
            router.push(`/admin/${userRole}`);
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

        // Admins see all by default, non-admins see their work only
        if (userRole === 'admin') {
          setMyWorkOnly(false);
        }
      } catch (err) {
        console.error('Auth error:', err);
        router.push(`/login?redirect=/admin/${role}`);
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router, role]);

  // Fetch videos
  const fetchVideos = useCallback(async () => {
    if (!authUser) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('sort', 'priority');
      params.set('limit', '100');

      if (defaultRecordingStatus) {
        params.set('recording_status', defaultRecordingStatus);
      }

      // Apply claimed filter
      if (myWorkOnly) {
        params.set('claimed_by', authUser.id);
        params.set('claimed', 'claimed');
      } else if (showUnclaimed) {
        params.set('claimed', 'unclaimed');
      } else {
        params.set('claimed', 'any');
      }

      const res = await fetch(`/api/videos/queue?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        // Apply client-side filter for role-specific items
        const filtered = (data.data as QueueVideo[]).filter(filterFn);
        setVideos(filtered);
      } else {
        setError(data.error || 'Failed to load videos');
      }
      setLastRefresh(new Date());
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [authUser, myWorkOnly, showUnclaimed, defaultRecordingStatus, filterFn]);

  useEffect(() => {
    if (authUser) {
      fetchVideos();
      const interval = setInterval(fetchVideos, 15000);
      return () => clearInterval(interval);
    }
  }, [authUser, fetchVideos]);

  // Claim & Start action
  const claimAndStart = async (videoId: string) => {
    setClaimingVideoId(videoId);
    setActionError(null);

    try {
      const res = await fetch(`/api/videos/${videoId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_role: role }),
      });

      const data = await res.json();

      if (data.ok) {
        // Open video details in new tab
        window.open(`/admin/pipeline/${videoId}`, '_blank');
        // Refresh list
        fetchVideos();
      } else if (data.code === 'ALREADY_CLAIMED') {
        setActionError({
          videoId,
          message: `Already claimed by ${data.details?.claimed_by || 'someone else'}`,
        });
        fetchVideos();
      } else {
        setActionError({ videoId, message: data.error || 'Failed to claim' });
      }
    } catch (err) {
      setActionError({ videoId, message: 'Network error' });
    } finally {
      setClaimingVideoId(null);
    }
  };

  // Release action
  const releaseVideo = async (videoId: string) => {
    setClaimingVideoId(videoId);
    setActionError(null);

    try {
      const res = await fetch(`/api/videos/${videoId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (data.ok) {
        fetchVideos();
      } else {
        setActionError({ videoId, message: data.error || 'Failed to release' });
      }
    } catch (err) {
      setActionError({ videoId, message: 'Network error' });
    } finally {
      setClaimingVideoId(null);
    }
  };

  // Loading states
  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!authUser) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  const isClaimedByMe = (video: QueueVideo) => video.claimed_by === authUser.id;
  const isClaimedByOther = (video: QueueVideo) => {
    if (!video.claimed_by || video.claimed_by === authUser.id) return false;
    if (!video.claim_expires_at) return true;
    return new Date(video.claim_expires_at) > new Date();
  };
  const isUnclaimed = (video: QueueVideo) => {
    if (!video.claimed_by) return true;
    if (!video.claim_expires_at) return false;
    return new Date(video.claim_expires_at) <= new Date();
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button
            onClick={fetchVideos}
            style={{ padding: '8px 16px', cursor: 'pointer' }}
          >
            Refresh
          </button>
          {lastRefresh && (
            <span style={{ color: '#666', fontSize: '14px' }}>
              Updated: {hydrated ? lastRefresh.toLocaleTimeString() : ''}
            </span>
          )}
        </div>
      </div>

      {/* User info bar */}
      <div style={{
        marginBottom: '20px',
        padding: '12px 16px',
        backgroundColor: '#e7f5ff',
        borderRadius: '4px',
        border: '1px solid #74c0fc',
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 'bold' }}>Signed in as:</span>
        <span style={{
          padding: '4px 12px',
          backgroundColor: '#fff',
          borderRadius: '4px',
          border: '1px solid #74c0fc',
        }}>
          {authUser.email || authUser.id.slice(0, 8)}
        </span>
        {authUser.role && (
          <span style={{
            padding: '3px 8px',
            backgroundColor: authUser.role === 'admin' ? '#ffe3e3' : '#d3f9d8',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            textTransform: 'capitalize',
          }}>
            {authUser.role}
          </span>
        )}
        <button
          onClick={async () => {
            const supabase = createBrowserSupabaseClient();
            await supabase.auth.signOut();
            router.push('/login');
          }}
          style={{
            padding: '4px 10px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Sign Out
        </button>
        <span style={{ color: '#ccc' }}>|</span>
        <Link href="/admin/pipeline" style={{ color: '#1971c2', fontSize: '13px' }}>
          Full Pipeline View
        </Link>
      </div>

      {/* Filters */}
      <div style={{
        marginBottom: '20px',
        padding: '12px 16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        border: '1px solid #dee2e6',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={myWorkOnly}
            onChange={(e) => {
              setMyWorkOnly(e.target.checked);
              if (e.target.checked) setShowUnclaimed(false);
            }}
          />
          <span style={{ fontWeight: myWorkOnly ? 'bold' : 'normal' }}>My Work Only</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showUnclaimed}
            onChange={(e) => {
              setShowUnclaimed(e.target.checked);
              if (e.target.checked) setMyWorkOnly(false);
            }}
          />
          <span style={{ fontWeight: showUnclaimed ? 'bold' : 'normal' }}>Show Unclaimed</span>
        </label>
        <span style={{ color: '#666', fontSize: '13px', marginLeft: 'auto' }}>
          {videos.length} item(s) {loading && '(loading...)'}
        </span>
      </div>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>
      )}

      {/* Video table */}
      {videos.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>SLA</th>
              <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Video ID</th>
              <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Status</th>
              <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Next Action</th>
              <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Age</th>
              <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Claim</th>
              <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => {
              const slaColors = getSlaColor(video.sla_status);
              const claimedByOther = isClaimedByOther(video);
              const claimedByMe = isClaimedByMe(video);
              const unclaimed = isUnclaimed(video);
              const isProcessing = claimingVideoId === video.id;
              const hasError = actionError?.videoId === video.id;

              return (
                <tr
                  key={video.id}
                  style={{
                    backgroundColor: claimedByMe ? '#e8f5e9' : claimedByOther ? '#fff3e0' : 'transparent',
                  }}
                >
                  {/* SLA Badge */}
                  <td style={{ border: '1px solid #ccc', padding: '10px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: slaColors.bg,
                      color: slaColors.text,
                      border: `1px solid ${slaColors.border}`,
                      fontSize: '11px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                    }}>
                      {video.sla_status === 'overdue' ? 'OVERDUE' :
                       video.sla_status === 'due_soon' ? 'DUE SOON' : 'ON TRACK'}
                    </span>
                  </td>

                  {/* Video ID */}
                  <td style={{ border: '1px solid #ccc', padding: '10px', fontFamily: 'monospace', fontSize: '12px' }}>
                    <Link href={`/admin/pipeline/${video.id}`} style={{ color: '#0066cc' }}>
                      {video.id.slice(0, 8)}...
                    </Link>
                  </td>

                  {/* Status */}
                  <td style={{ border: '1px solid #ccc', padding: '10px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      backgroundColor: '#e9ecef',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}>
                      {(video.recording_status || 'NOT_RECORDED').replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Next Action */}
                  <td style={{ border: '1px solid #ccc', padding: '10px' }}>
                    <div style={{ fontSize: '13px' }}>
                      {video.next_action}
                      {video.blocked_reason && (
                        <div style={{
                          marginTop: '4px',
                          padding: '3px 6px',
                          backgroundColor: '#fff3cd',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#856404',
                        }}>
                          {video.blocked_reason}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Age in stage */}
                  <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '12px' }}>
                    {formatDuration(video.age_minutes_in_stage)}
                  </td>

                  {/* Claim status */}
                  <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '12px' }}>
                    {unclaimed ? (
                      <span style={{ color: '#28a745' }}>Unclaimed</span>
                    ) : claimedByMe ? (
                      <span style={{ color: '#0066cc', fontWeight: 'bold' }}>You</span>
                    ) : (
                      <div>
                        <span style={{ color: '#dc3545' }}>{video.claimed_by?.slice(0, 8)}...</span>
                        {video.claim_role && (
                          <span style={{
                            marginLeft: '4px',
                            padding: '1px 4px',
                            backgroundColor: '#e9ecef',
                            borderRadius: '4px',
                            fontSize: '10px',
                          }}>
                            {video.claim_role}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ border: '1px solid #ccc', padding: '10px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {unclaimed && (
                        <button
                          onClick={() => claimAndStart(video.id)}
                          disabled={isProcessing}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          {isProcessing ? '...' : 'Claim & Start'}
                        </button>
                      )}

                      {claimedByMe && (
                        <>
                          <Link
                            href={`/admin/pipeline/${video.id}`}
                            target="_blank"
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#228be6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              textDecoration: 'none',
                              fontSize: '12px',
                            }}
                          >
                            Open
                          </Link>
                          <button
                            onClick={() => releaseVideo(video.id)}
                            disabled={isProcessing}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            {isProcessing ? '...' : 'Release'}
                          </button>
                        </>
                      )}

                      {claimedByOther && (
                        <span style={{ color: '#999', fontSize: '11px', fontStyle: 'italic' }}>
                          Locked
                        </span>
                      )}

                      {hasError && (
                        <span style={{ color: '#dc3545', fontSize: '11px' }}>
                          {actionError?.message}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          color: '#666',
        }}>
          {loading ? 'Loading...' : 'No items available for this filter'}
        </div>
      )}

      <div style={{ marginTop: '20px', color: '#999', fontSize: '12px' }}>
        Auto-refreshes every 15 seconds. Sorted by priority (overdue first).
      </div>
    </div>
  );
}
