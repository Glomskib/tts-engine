'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated, getTimeAgo } from '@/lib/useHydrated';
import VideoDrawer from '@/app/admin/pipeline/components/VideoDrawer';
import { getPrimaryAction, getStatusBadgeColor, getSlaColor } from '@/app/admin/pipeline/types';

type UserRole = 'admin' | 'recorder' | 'editor' | 'uploader' | null;

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
  concept_id: string | null;
  product_id: string | null;
  final_video_url?: string | null;
  can_move_next: boolean;
  blocked_reason: string | null;
  next_action: string;
  next_status: string | null;
  can_record: boolean;
  can_mark_edited: boolean;
  can_mark_ready_to_post: boolean;
  can_mark_posted: boolean;
  required_fields: string[];
  sla_deadline_at: string | null;
  sla_status: 'on_track' | 'due_soon' | 'overdue';
  age_minutes_in_stage: number;
  priority_score: number;
  brand_name?: string;
  product_name?: string;
  product_sku?: string;
  account_name?: string;
}

// Role to status filter mapping
const ROLE_STATUS_FILTER: Record<string, string> = {
  recorder: 'NOT_RECORDED',
  editor: 'RECORDED',
  uploader: 'READY_TO_POST',
};

export default function MyTasksPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [role, setRole] = useState<UserRole>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<QueueVideo[]>([]);
  const [drawerVideo, setDrawerVideo] = useState<QueueVideo | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // Fetch auth
  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.user) {
            setRole(data.role);
            setUserId(data.user.id);

            // Redirect admin to pipeline
            if (data.role === 'admin') {
              router.replace('/admin/pipeline');
              return;
            }
          }
        }
      } catch (err) {
        console.error('Auth fetch failed:', err);
      }
    };
    fetchAuth();
  }, [router]);

  // Fetch videos for my role
  const fetchVideos = useCallback(async () => {
    if (!role || role === 'admin') return;

    setLoading(true);
    try {
      const statusFilter = ROLE_STATUS_FILTER[role] || '';
      const res = await fetch(`/api/videos/queue?recording_status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          // Sort: mine first, then available, then locked by others
          const sorted = [...(data.data || [])].sort((a, b) => {
            const aIsMine = a.claimed_by === userId;
            const bIsMine = b.claimed_by === userId;
            const aIsAvailable = !a.claimed_by || (a.claim_expires_at && new Date(a.claim_expires_at) <= new Date());
            const bIsAvailable = !b.claimed_by || (b.claim_expires_at && new Date(b.claim_expires_at) <= new Date());

            if (aIsMine && !bIsMine) return -1;
            if (!aIsMine && bIsMine) return 1;
            if (aIsAvailable && !bIsAvailable) return -1;
            if (!aIsAvailable && bIsAvailable) return 1;
            return (b.priority_score || 0) - (a.priority_score || 0);
          });
          setVideos(sorted);
        }
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    } finally {
      setLoading(false);
    }
  }, [role, userId]);

  useEffect(() => {
    if (role && role !== 'admin') {
      fetchVideos();
      const interval = setInterval(fetchVideos, 15000);
      return () => clearInterval(interval);
    }
  }, [role, fetchVideos]);

  // Claim video
  const claimVideo = async (videoId: string) => {
    setProcessing(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        await fetchVideos();
      }
    } finally {
      setProcessing(null);
    }
  };

  // Release video
  const releaseVideo = async (videoId: string) => {
    setProcessing(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}/release`, { method: 'POST' });
      if (res.ok) {
        await fetchVideos();
      }
    } finally {
      setProcessing(null);
    }
  };

  // Execute transition
  const executeTransition = async (videoId: string, targetStatus: string) => {
    setProcessing(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (res.ok) {
        await fetchVideos();
      }
    } finally {
      setProcessing(null);
    }
  };

  // Check claim status
  const isClaimedByMe = (video: QueueVideo) => video.claimed_by === userId;
  const isClaimedByOther = (video: QueueVideo) => {
    if (!video.claimed_by || video.claimed_by === userId) return false;
    if (video.claim_expires_at && new Date(video.claim_expires_at) <= new Date()) return false;
    return true;
  };
  const isAvailable = (video: QueueVideo) => {
    if (!video.claimed_by) return true;
    if (video.claim_expires_at && new Date(video.claim_expires_at) <= new Date()) return true;
    return false;
  };

  const getRoleTitle = () => {
    switch (role) {
      case 'recorder': return 'Videos to Record';
      case 'editor': return 'Videos to Edit';
      case 'uploader': return 'Videos to Post';
      default: return 'My Tasks';
    }
  };

  const getRoleInstruction = () => {
    switch (role) {
      case 'recorder': return 'Record these videos and mark them as recorded when done.';
      case 'editor': return 'Edit these videos and upload the final MP4.';
      case 'uploader': return 'Post these videos to the target platform.';
      default: return '';
    }
  };

  // Advance to next video in queue (for auto-advance after completing action)
  const advanceToNextVideo = () => {
    if (!drawerVideo) return;

    const allVideos = [...videos];
    const currentIndex = allVideos.findIndex(v => v.id === drawerVideo.id);

    if (currentIndex >= 0 && currentIndex < allVideos.length - 1) {
      // Advance to next video
      setDrawerVideo(allVideos[currentIndex + 1]);
    } else if (allVideos.length > 0 && currentIndex === allVideos.length - 1) {
      // At the end of list, go to first available if any
      const firstAvailable = allVideos.find(v => isAvailable(v));
      if (firstAvailable) {
        setDrawerVideo(firstAvailable);
      } else {
        // No more tasks, close drawer
        setDrawerVideo(null);
      }
    } else {
      setDrawerVideo(null);
    }
  };

  if (!role || role === 'admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        Loading...
      </div>
    );
  }

  const myVideos = videos.filter(v => isClaimedByMe(v));
  const availableVideos = videos.filter(v => isAvailable(v) && !isClaimedByMe(v));
  const lockedVideos = videos.filter(v => isClaimedByOther(v));

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '24px', color: '#212529' }}>
          {getRoleTitle()}
        </h1>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
          {getRoleInstruction()}
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          Loading tasks...
        </div>
      ) : videos.length === 0 ? (
        <div style={{
          padding: '60px 40px',
          textAlign: 'center',
          backgroundColor: '#d3f9d8',
          borderRadius: '12px',
          border: '1px solid #69db7c',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ margin: '0 0 8px', color: '#2b8a3e' }}>All caught up!</h2>
          <p style={{ margin: 0, color: '#40c057' }}>No videos need your attention right now.</p>
        </div>
      ) : (
        <>
          {/* My Videos (In Progress) */}
          {myVideos.length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', color: '#495057', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#40c057' }}>●</span> My Tasks ({myVideos.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {myVideos.map(video => (
                  <VideoRow
                    key={video.id}
                    video={video}
                    status="mine"
                    hydrated={hydrated}
                    processing={processing === video.id}
                    onClick={() => setDrawerVideo(video)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Available Videos */}
          {availableVideos.length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', color: '#495057', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#228be6' }}>●</span> Available ({availableVideos.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {availableVideos.map(video => (
                  <VideoRow
                    key={video.id}
                    video={video}
                    status="available"
                    hydrated={hydrated}
                    processing={processing === video.id}
                    onClick={() => setDrawerVideo(video)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Locked Videos */}
          {lockedVideos.length > 0 && (
            <section>
              <h2 style={{ fontSize: '16px', color: '#868e96', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔒</span> In Progress by Others ({lockedVideos.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lockedVideos.map(video => (
                  <VideoRow
                    key={video.id}
                    video={video}
                    status="locked"
                    hydrated={hydrated}
                    processing={processing === video.id}
                    onClick={() => setDrawerVideo(video)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Drawer */}
      {drawerVideo && (
        <VideoDrawer
          video={drawerVideo}
          simpleMode={true}
          activeUser={userId || ''}
          isAdmin={false}
          onClose={() => setDrawerVideo(null)}
          onClaimVideo={claimVideo}
          onReleaseVideo={releaseVideo}
          onExecuteTransition={executeTransition}
          onOpenAttachModal={() => {}}
          onOpenPostModal={() => {}}
          onRefresh={() => {
            fetchVideos();
            const updated = videos.find(v => v.id === drawerVideo.id);
            if (updated) setDrawerVideo(updated);
          }}
          onAdvanceToNext={advanceToNextVideo}
        />
      )}
    </div>
  );
}

// Video row component
function VideoRow({
  video,
  status,
  hydrated,
  processing,
  onClick,
}: {
  video: QueueVideo;
  status: 'mine' | 'available' | 'locked';
  hydrated: boolean;
  processing: boolean;
  onClick: () => void;
}) {
  const primaryAction = getPrimaryAction(video);
  const slaColors = getSlaColor(video.sla_status);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        backgroundColor: status === 'mine' ? '#e8f5e9' : status === 'locked' ? '#f8f9fa' : 'white',
        borderRadius: '8px',
        border: `1px solid ${status === 'mine' ? '#a5d6a7' : '#e9ecef'}`,
        cursor: 'pointer',
        opacity: status === 'locked' ? 0.7 : 1,
      }}
    >
      {/* SLA indicator */}
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: slaColors.text,
        flexShrink: 0,
      }} />

      {/* Video info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          {video.brand_name && (
            <span style={{
              padding: '2px 8px',
              backgroundColor: '#e7f5ff',
              color: '#1971c2',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
            }}>
              {video.brand_name}
            </span>
          )}
          {video.product_sku && (
            <span style={{
              padding: '2px 8px',
              backgroundColor: '#f8f9fa',
              color: '#495057',
              borderRadius: '4px',
              fontSize: '12px',
              border: '1px solid #dee2e6',
            }}>
              {video.product_sku}
            </span>
          )}
          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#868e96' }}>
            {video.id.slice(0, 8)}
          </span>
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          {hydrated && video.created_at ? getTimeAgo(video.created_at) : '—'}
          {status === 'locked' && video.claimed_by && (
            <span style={{ marginLeft: '8px', color: '#e67700' }}>
              • Assigned to {video.claimed_by.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>

      {/* Next action */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        backgroundColor: status === 'locked' ? '#e9ecef' : primaryAction.color + '20',
        borderRadius: '6px',
      }}>
        <span>{primaryAction.icon}</span>
        <span style={{
          fontSize: '13px',
          fontWeight: 'bold',
          color: status === 'locked' ? '#868e96' : primaryAction.color,
        }}>
          {status === 'locked' ? 'Locked' : primaryAction.label}
        </span>
      </div>
    </div>
  );
}
