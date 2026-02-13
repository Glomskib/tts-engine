'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { useToast } from '@/contexts/ToastContext';

interface ReviewVideo {
  id: string;
  video_code: string | null;
  recording_status: string | null;
  final_video_url?: string | null;
  script_locked_text: string | null;
  brand_name?: string;
  product_name?: string;
  product_sku?: string;
  product_category?: string | null;
  account_name?: string;
  last_status_changed_at: string | null;
  concept_id: string | null;
}

interface VideoDetails {
  brief: {
    angle: string | null;
    on_screen_text_hook: string | null;
    on_screen_text_mid: string[] | null;
    on_screen_text_cta: string | null;
    visual_hook: string | null;
    hook_options: string[] | null;
  } | null;
}

const REJECT_TAGS = [
  { code: 'bad_visuals', label: 'Bad Visuals' },
  { code: 'wrong_pacing', label: 'Wrong Pacing' },
  { code: 'audio_issues', label: 'Audio Issues' },
  { code: 'off_brand', label: 'Off Brand' },
  { code: 'wrong_angle', label: 'Wrong Angle' },
  { code: 'compliance', label: 'Compliance Issue' },
];

export default function ReviewPage() {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { showSuccess, showError } = useToast();

  const [videos, setVideos] = useState<ReviewVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Reject modal state
  const [rejectVideoId, setRejectVideoId] = useState<string | null>(null);
  const [selectedRejectTag, setSelectedRejectTag] = useState<string | null>(null);

  // Details cache (concept brief data for on-screen text overlays)
  const [detailsCache, setDetailsCache] = useState<Record<string, VideoDetails>>({});

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch('/api/videos/queue?recording_status=READY_FOR_REVIEW&limit=50');
      if (res.ok) {
        const data = await res.json();
        setVideos(data.data || []);
      }
    } catch {
      showError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Fetch details for each video (for on-screen text overlays)
  useEffect(() => {
    videos.forEach(async (video) => {
      if (detailsCache[video.id]) return;
      try {
        const res = await fetch(`/api/videos/${video.id}/details`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setDetailsCache(prev => ({ ...prev, [video.id]: data }));
          }
        }
      } catch {
        // ignore
      }
    });
  }, [videos, detailsCache]);

  const handleApprove = useCallback(async (videoId: string) => {
    setActionLoading(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'READY_TO_POST' }),
      });
      if (res.ok) {
        showSuccess('Video approved');
        setVideos(prev => {
          const next = prev.filter(v => v.id !== videoId);
          // Auto-advance: clamp activeIndex to new list length
          setActiveIndex(i => Math.min(i, Math.max(0, next.length - 1)));
          return next;
        });
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.message || 'Failed to approve');
      }
    } catch {
      showError('Network error');
    } finally {
      setActionLoading(null);
    }
  }, [showSuccess, showError]);

  const handleReject = async () => {
    if (!rejectVideoId) return;
    setActionLoading(rejectVideoId);
    try {
      const res = await fetch(`/api/videos/${rejectVideoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'REJECTED',
          reason_code: selectedRejectTag || 'unspecified',
          reason_message: selectedRejectTag
            ? REJECT_TAGS.find(t => t.code === selectedRejectTag)?.label
            : 'Rejected without reason',
        }),
      });
      if (res.ok) {
        showSuccess('Video rejected');
        setVideos(prev => {
          const next = prev.filter(v => v.id !== rejectVideoId);
          setActiveIndex(i => Math.min(i, Math.max(0, next.length - 1)));
          return next;
        });
        setRejectVideoId(null);
        setSelectedRejectTag(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.message || 'Failed to reject');
      }
    } catch {
      showError('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const getTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // Scroll active card into view when activeIndex changes
  useEffect(() => {
    const el = cardRefs.current[activeIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when reject modal is open (except Escape)
      if (rejectVideoId) {
        if (e.key === 'Escape') {
          setRejectVideoId(null);
          setSelectedRejectTag(null);
        }
        return;
      }
      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (videos.length === 0 || actionLoading) return;

      switch (e.key) {
        case 'a':
        case 'A': {
          e.preventDefault();
          const video = videos[activeIndex];
          if (video) handleApprove(video.id);
          break;
        }
        case 'r':
        case 'R': {
          e.preventDefault();
          const video = videos[activeIndex];
          if (video) {
            setRejectVideoId(video.id);
            setSelectedRejectTag(null);
          }
          break;
        }
        case 'ArrowUp':
        case 'ArrowLeft': {
          e.preventDefault();
          setActiveIndex(i => Math.max(0, i - 1));
          break;
        }
        case 'ArrowDown':
        case 'ArrowRight': {
          e.preventDefault();
          setActiveIndex(i => Math.min(videos.length - 1, i + 1));
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [videos, activeIndex, actionLoading, rejectVideoId, handleApprove]);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, margin: 0 }}>
            Video Review
          </h1>
          <p style={{ fontSize: '14px', color: colors.textMuted, margin: '4px 0 0' }}>
            {videos.length} video{videos.length !== 1 ? 's' : ''} awaiting review
            {videos.length > 0 && <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.7 }}>• Reviewing {activeIndex + 1} of {videos.length}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchVideos(); }}
          style={{
            padding: '8px 16px',
            backgroundColor: colors.surface,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: colors.textMuted,
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: `3px solid ${colors.border}`,
            borderTopColor: colors.accent,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px',
          }} />
          Loading videos...
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Empty State */}
      {!loading && videos.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          backgroundColor: colors.surface,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x2705;</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: colors.text, marginBottom: '8px' }}>
            All caught up
          </div>
          <div style={{ fontSize: '14px', color: colors.textMuted }}>
            No videos waiting for review right now.
          </div>
        </div>
      )}

      {/* Keyboard Hints */}
      {videos.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '16px',
          fontSize: '12px',
          color: colors.textMuted,
          flexWrap: 'wrap',
        }}>
          <span><kbd style={{ padding: '2px 6px', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', border: `1px solid ${colors.border}` }}>A</kbd> Approve</span>
          <span><kbd style={{ padding: '2px 6px', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', border: `1px solid ${colors.border}` }}>R</kbd> Reject</span>
          <span><kbd style={{ padding: '2px 6px', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', border: `1px solid ${colors.border}` }}>↑↓</kbd> Navigate</span>
        </div>
      )}

      {/* Video Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {videos.map((video, index) => {
          const details = detailsCache[video.id];
          const videoUrl = video.final_video_url || '';
          const isActioning = actionLoading === video.id;
          const isActive = index === activeIndex;

          return (
            <div
              key={video.id}
              ref={el => { cardRefs.current[index] = el; }}
              onClick={() => setActiveIndex(index)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: '12px',
                border: isActive
                  ? `2px solid ${isDark ? '#34d399' : '#059669'}`
                  : `1px solid ${colors.border}`,
                overflow: 'hidden',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                boxShadow: isActive ? `0 0 0 3px ${isDark ? 'rgba(52,211,153,0.15)' : 'rgba(5,150,105,0.1)'}` : 'none',
                cursor: 'pointer',
              }}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: videoUrl ? '400px 1fr' : '1fr',
                gap: '0',
              }}>
                {/* Video Player */}
                {videoUrl && (
                  <div style={{
                    backgroundColor: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '300px',
                  }}>
                    <video
                      src={videoUrl}
                      controls
                      playsInline
                      style={{
                        width: '100%',
                        maxHeight: '400px',
                        objectFit: 'contain',
                      }}
                    />
                  </div>
                )}

                {/* Info Panel */}
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Product + Brand Header */}
                  <div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: colors.text }}>
                          {video.product_name || video.product_sku || 'Unknown Product'}
                        </div>
                        <div style={{ fontSize: '13px', color: colors.textMuted, marginTop: '2px' }}>
                          {[video.brand_name, video.product_category].filter(Boolean).join(' / ')}
                        </div>
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: colors.textMuted,
                        whiteSpace: 'nowrap',
                      }}>
                        {getTimeAgo(video.last_status_changed_at)}
                      </div>
                    </div>
                    {video.video_code && (
                      <div style={{
                        fontSize: '11px',
                        color: colors.textMuted,
                        fontFamily: 'monospace',
                        marginTop: '4px',
                      }}>
                        {video.video_code}
                      </div>
                    )}
                  </div>

                  {/* Script */}
                  {video.script_locked_text && (
                    <div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: colors.textMuted,
                        textTransform: 'uppercase',
                        marginBottom: '6px',
                        letterSpacing: '0.5px',
                      }}>
                        Script
                      </div>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: '1.6',
                        color: colors.text,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                        padding: '12px',
                        borderRadius: '8px',
                        maxHeight: '120px',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {video.script_locked_text}
                      </div>
                    </div>
                  )}

                  {/* On-Screen Text Overlays */}
                  {details?.brief && (details.brief.on_screen_text_hook || details.brief.on_screen_text_mid?.length || details.brief.on_screen_text_cta) && (
                    <div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: colors.textMuted,
                        textTransform: 'uppercase',
                        marginBottom: '6px',
                        letterSpacing: '0.5px',
                      }}>
                        On-Screen Text
                      </div>
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                      }}>
                        {details.brief.on_screen_text_hook && (
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: '#ecfdf5',
                            color: '#059669',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            border: '1px solid #a7f3d0',
                          }}>
                            Hook: {details.brief.on_screen_text_hook}
                          </span>
                        )}
                        {details.brief.on_screen_text_mid?.map((text, i) => (
                          <span
                            key={i}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#eff6ff',
                              color: '#2563eb',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 500,
                              border: '1px solid #bfdbfe',
                            }}
                          >
                            {text}
                          </span>
                        ))}
                        {details.brief.on_screen_text_cta && (
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: '#fef3c7',
                            color: '#d97706',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            border: '1px solid #fde68a',
                          }}>
                            CTA: {details.brief.on_screen_text_cta}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Spoken Hook */}
                  {details?.brief?.hook_options?.[0] && (
                    <div style={{ fontSize: '13px', color: colors.textMuted }}>
                      <span style={{ fontWeight: 600 }}>Spoken Hook:</span> {details.brief.hook_options[0]}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginTop: 'auto',
                    paddingTop: '8px',
                  }}>
                    <button
                      type="button"
                      onClick={() => handleApprove(video.id)}
                      disabled={isActioning}
                      style={{
                        flex: 1,
                        padding: '12px 20px',
                        backgroundColor: isActioning ? '#94a3b8' : '#059669',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isActioning ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      {isActioning ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRejectVideoId(video.id); setSelectedRejectTag(null); }}
                      disabled={isActioning}
                      style={{
                        padding: '12px 20px',
                        backgroundColor: 'transparent',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: '8px',
                        cursor: isActioning ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reject Modal */}
      {rejectVideoId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setRejectVideoId(null)}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '16px',
              padding: '24px',
              width: '400px',
              maxWidth: '90vw',
              border: `1px solid ${colors.border}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: colors.text }}>
              Reject Video
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: colors.textMuted }}>
              Select a reason for rejecting this video:
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              {REJECT_TAGS.map(tag => (
                <button
                  key={tag.code}
                  type="button"
                  onClick={() => setSelectedRejectTag(tag.code === selectedRejectTag ? null : tag.code)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: selectedRejectTag === tag.code
                      ? '#fecaca'
                      : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    color: selectedRejectTag === tag.code ? '#dc2626' : colors.text,
                    border: `1px solid ${selectedRejectTag === tag.code ? '#f87171' : colors.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  {tag.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRejectVideoId(null)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: colors.textMuted,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={!selectedRejectTag || actionLoading === rejectVideoId}
                style={{
                  padding: '10px 20px',
                  backgroundColor: !selectedRejectTag ? '#94a3b8' : '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: !selectedRejectTag ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {actionLoading === rejectVideoId ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
