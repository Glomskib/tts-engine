'use client';

import { useState, useEffect, useCallback } from 'react';
import type { QueueVideo } from '../types';
import { getStatusBadgeColor, getSlaColor, getPrimaryAction, getReadinessIndicators } from '../types';
import { formatDateString, getTimeAgo, useHydrated } from '@/lib/useHydrated';

interface VideoDrawerProps {
  video: QueueVideo;
  simpleMode: boolean;
  activeUser: string;
  isAdmin: boolean;
  onClose: () => void;
  onClaimVideo: (videoId: string) => Promise<void>;
  onReleaseVideo: (videoId: string) => Promise<void>;
  onExecuteTransition: (videoId: string, targetStatus: string) => Promise<void>;
  onOpenAttachModal: (video: QueueVideo) => void;
  onOpenPostModal: (video: QueueVideo) => void;
  onOpenHandoffModal?: (video: QueueVideo) => void;
  onRefresh: () => void;
}

interface VideoDetails {
  video: {
    id: string;
    brand_name: string | null;
    product_name: string | null;
    product_sku: string | null;
    account_name: string | null;
    account_platform: string | null;
    google_drive_url: string | null;
    final_video_url: string | null;
    posted_url: string | null;
    created_at: string;
    last_status_changed_at: string | null;
  };
  brief: {
    concept_id: string;
    title: string | null;
    angle: string | null;
    hypothesis: string | null;
    proof_type: string | null;
    hook_options: string[] | null;
    notes: string | null;
  } | null;
  script: {
    text: string;
    version: number;
    locked: boolean;
  } | null;
  assets: {
    raw_footage_url: string | null;
    final_mp4_url: string | null;
    thumbnail_url: string | null;
    google_drive_url: string | null;
    screenshots: string[];
  };
  events: {
    id: string;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    actor: string;
    details: Record<string, unknown> | null;
    created_at: string;
  }[];
}

type TabType = 'brief' | 'script' | 'assets' | 'activity';

export default function VideoDrawer({
  video,
  simpleMode,
  activeUser,
  isAdmin,
  onClose,
  onClaimVideo,
  onReleaseVideo,
  onExecuteTransition,
  onOpenAttachModal,
  onOpenPostModal,
  onOpenHandoffModal,
  onRefresh,
}: VideoDrawerProps) {
  const hydrated = useHydrated();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('brief');
  const [details, setDetails] = useState<VideoDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const statusColors = getStatusBadgeColor(video.recording_status);
  const slaColors = getSlaColor(video.sla_status);
  const primaryAction = getPrimaryAction(video);
  const readiness = getReadinessIndicators(video);

  const isClaimedByMe = video.claimed_by === activeUser;
  const isClaimedByOther = !!(video.claimed_by && video.claimed_by !== activeUser &&
    (!video.claim_expires_at || new Date(video.claim_expires_at) > new Date()));
  const isUnclaimed = !video.claimed_by || !!(video.claim_expires_at && new Date(video.claim_expires_at) <= new Date());

  // Fetch detailed info
  const fetchDetails = useCallback(async () => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/videos/${video.id}/details`);
      const data = await res.json();
      if (data.ok) {
        setDetails(data);
      }
    } catch (err) {
      console.error('Failed to fetch video details:', err);
    } finally {
      setDetailsLoading(false);
    }
  }, [video.id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handlePrimaryAction = async () => {
    setLoading(true);
    try {
      // Auto-assign if video is available (not assigned to anyone)
      if (isUnclaimed && primaryAction.type !== 'done') {
        await onClaimVideo(video.id);
      }

      switch (primaryAction.type) {
        case 'add_script':
          onOpenAttachModal(video);
          break;
        case 'record':
          await onExecuteTransition(video.id, 'RECORDED');
          onRefresh();
          break;
        case 'upload_edit':
          await onExecuteTransition(video.id, 'EDITED');
          onRefresh();
          break;
        case 'approve':
          await onExecuteTransition(video.id, 'READY_TO_POST');
          onRefresh();
          break;
        case 'post':
          onOpenPostModal(video);
          break;
        default:
          break;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    setLoading(true);
    try {
      await onClaimVideo(video.id);
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async () => {
    setLoading(true);
    try {
      await onReleaseVideo(video.id);
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await onExecuteTransition(video.id, 'REJECTED');
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  // Extract hook from script (first line or first sentence)
  const extractHook = (scriptText: string) => {
    const lines = scriptText.split('\n');
    const firstLine = lines[0]?.trim() || '';
    if (firstLine.length > 100) {
      return firstLine.slice(0, 100) + '...';
    }
    return firstLine;
  };

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'brief', label: 'Brief', icon: '📋' },
    { key: 'script', label: 'Script', icon: '📝' },
    { key: 'assets', label: 'Assets', icon: '📁' },
    { key: 'activity', label: 'Activity', icon: '📊' },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: simpleMode ? '380px' : '480px',
          backgroundColor: 'white',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#f8f9fa',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              {/* Video ID with copy */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#495057' }}>
                  {video.id.slice(0, 12)}...
                </span>
                <button
                  onClick={() => copyToClipboard(video.id, 'videoId')}
                  style={{
                    padding: '2px 6px',
                    fontSize: '10px',
                    backgroundColor: copiedField === 'videoId' ? '#d3f9d8' : '#e9ecef',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    color: copiedField === 'videoId' ? '#2b8a3e' : '#495057',
                  }}
                >
                  {copiedField === 'videoId' ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Badges row */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Brand badge */}
                {(video.brand_name || details?.video.brand_name) && (
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#e7f5ff',
                    color: '#1971c2',
                    fontSize: '11px',
                    fontWeight: 'bold',
                  }}>
                    {video.brand_name || details?.video.brand_name}
                  </span>
                )}
                {/* SKU badge */}
                {(video.product_sku || details?.video.product_sku) && (
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: '#f8f9fa',
                    color: '#495057',
                    fontSize: '11px',
                    border: '1px solid #dee2e6',
                  }}>
                    {video.product_sku || details?.video.product_sku}
                  </span>
                )}
                {/* Status badge */}
                <span style={{
                  padding: '3px 8px',
                  borderRadius: '12px',
                  backgroundColor: statusColors.badge,
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 'bold',
                }}>
                  {(video.recording_status || 'NOT_RECORDED').replace(/_/g, ' ')}
                </span>
                {/* SLA badge */}
                <span style={{
                  padding: '3px 6px',
                  borderRadius: '4px',
                  backgroundColor: slaColors.bg,
                  color: slaColors.text,
                  border: `1px solid ${slaColors.border}`,
                  fontSize: '9px',
                  fontWeight: 'bold',
                }}>
                  {video.sla_status === 'overdue' ? 'OVERDUE' : video.sla_status === 'due_soon' ? 'DUE SOON' : 'ON TRACK'}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
                padding: '0',
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>

          {/* Next Action Section */}
          <div style={{
            padding: '12px',
            backgroundColor: '#e7f5ff',
            borderRadius: '8px',
            border: '1px solid #74c0fc',
          }}>
            <div style={{ fontSize: '10px', color: '#1971c2', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              Next Step
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#212529' }}>
                {primaryAction.icon} {primaryAction.label}
              </span>
              <button
                onClick={handlePrimaryAction}
                disabled={loading || primaryAction.type === 'done' || isClaimedByOther}
                style={{
                  padding: '8px 16px',
                  backgroundColor: loading || primaryAction.type === 'done' || isClaimedByOther ? '#ccc' : primaryAction.color,
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading || primaryAction.type === 'done' || isClaimedByOther ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                }}
              >
                {loading ? '...' : isClaimedByOther ? `🔒 Locked` : primaryAction.label}
              </button>
            </div>
            {video.blocked_reason && (
              <div style={{
                marginTop: '8px',
                padding: '6px 8px',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#856404',
              }}>
                {video.blocked_reason}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e0e0e0',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                borderBottom: activeTab === tab.key ? '3px solid #228be6' : '3px solid transparent',
                backgroundColor: activeTab === tab.key ? '#f8f9fa' : 'transparent',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: activeTab === tab.key ? 'bold' : 'normal',
                color: activeTab === tab.key ? '#228be6' : '#495057',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <span>{tab.icon}</span>
              {!simpleMode && <span>{tab.label}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {detailsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#868e96' }}>
              Loading details...
            </div>
          ) : (
            <>
              {/* Brief Tab */}
              {activeTab === 'brief' && (
                <div>
                  {details?.brief ? (
                    <>
                      {/* Hook */}
                      {details.brief.hook_options && details.brief.hook_options.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <h4 style={{ margin: 0, fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Hook Options</h4>
                            <button
                              onClick={() => copyToClipboard(details.brief?.hook_options?.join('\n') || '', 'hooks')}
                              style={{
                                padding: '2px 8px',
                                fontSize: '10px',
                                backgroundColor: copiedField === 'hooks' ? '#d3f9d8' : '#e9ecef',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                              }}
                            >
                              {copiedField === 'hooks' ? 'Copied!' : 'Copy All'}
                            </button>
                          </div>
                          <div style={{ backgroundColor: '#f8f9fa', borderRadius: '6px', padding: '10px' }}>
                            {details.brief.hook_options.map((hook, idx) => (
                              <div key={idx} style={{
                                padding: '6px 0',
                                borderBottom: idx < details.brief!.hook_options!.length - 1 ? '1px solid #e9ecef' : 'none',
                                fontSize: '13px',
                              }}>
                                {idx + 1}. {hook}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Angle */}
                      {details.brief.angle && (
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Angle</h4>
                          <div style={{ backgroundColor: '#f8f9fa', borderRadius: '6px', padding: '10px', fontSize: '13px' }}>
                            {details.brief.angle}
                          </div>
                        </div>
                      )}

                      {/* Notes/B-roll checklist */}
                      {details.brief.notes && (
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Notes / B-Roll Checklist</h4>
                          <div style={{
                            backgroundColor: '#f8f9fa',
                            borderRadius: '6px',
                            padding: '10px',
                            fontSize: '13px',
                            whiteSpace: 'pre-wrap',
                          }}>
                            {details.brief.notes}
                          </div>
                        </div>
                      )}

                      {/* Proof Type */}
                      {details.brief.proof_type && (
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Proof Type</h4>
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: '#e7f5ff',
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: '#1971c2',
                          }}>
                            {details.brief.proof_type}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      color: '#868e96',
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                      <div>No concept/brief linked to this video</div>
                    </div>
                  )}

                  {/* Editor Checklist */}
                  <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f1f3f5', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '12px', color: '#495057', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      Editor Checklist
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: video.script_locked_text ? '#40c057' : '#868e96' }}>
                          {video.script_locked_text ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: '13px', color: video.script_locked_text ? '#212529' : '#868e96' }}>
                          Script locked
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: video.google_drive_url ? '#40c057' : '#868e96' }}>
                          {video.google_drive_url ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: '13px', color: video.google_drive_url ? '#212529' : '#868e96' }}>
                          Drive folder linked
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: video.final_video_url ? '#40c057' : '#868e96' }}>
                          {video.final_video_url ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: '13px', color: video.final_video_url ? '#212529' : '#868e96' }}>
                          Final MP4 uploaded
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED' ? '#40c057' : '#868e96' }}>
                          {video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED' ? '✓' : '○'}
                        </span>
                        <span style={{ fontSize: '13px', color: video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED' ? '#212529' : '#868e96' }}>
                          Edit completed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Script Tab */}
              {activeTab === 'script' && (
                <div>
                  {video.script_locked_text ? (
                    <>
                      {/* Script version info */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '3px 8px',
                            backgroundColor: '#d3f9d8',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#2b8a3e',
                            fontWeight: 'bold',
                          }}>
                            Locked v{video.script_locked_version || 1}
                          </span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(video.script_locked_text || '', 'fullScript')}
                          style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            backgroundColor: copiedField === 'fullScript' ? '#d3f9d8' : '#228be6',
                            color: copiedField === 'fullScript' ? '#2b8a3e' : 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                          }}
                        >
                          {copiedField === 'fullScript' ? 'Copied!' : 'Copy Full Script'}
                        </button>
                      </div>

                      {/* Hook extract with copy */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <h4 style={{ margin: 0, fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Hook (First Line)</h4>
                          <button
                            onClick={() => copyToClipboard(extractHook(video.script_locked_text || ''), 'hook')}
                            style={{
                              padding: '2px 8px',
                              fontSize: '10px',
                              backgroundColor: copiedField === 'hook' ? '#d3f9d8' : '#e9ecef',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: 'pointer',
                            }}
                          >
                            {copiedField === 'hook' ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div style={{
                          backgroundColor: '#fff3bf',
                          borderRadius: '6px',
                          padding: '10px',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#495057',
                        }}>
                          {extractHook(video.script_locked_text || '')}
                        </div>
                      </div>

                      {/* Full script */}
                      <div>
                        <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>Full Script</h4>
                        <div style={{
                          backgroundColor: '#f8f9fa',
                          borderRadius: '6px',
                          padding: '12px',
                          fontSize: '13px',
                          lineHeight: 1.6,
                          maxHeight: '300px',
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          border: '1px solid #e9ecef',
                        }}>
                          {video.script_locked_text}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
                      <div style={{ color: '#856404', marginBottom: '16px' }}>No script attached yet</div>
                      <button
                        onClick={() => onOpenAttachModal(video)}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#17a2b8',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                        }}
                      >
                        Attach Script
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Assets Tab */}
              {activeTab === 'assets' && (
                <div>
                  {/* Google Drive */}
                  {(video.google_drive_url || details?.assets.google_drive_url) && (
                    <a
                      href={video.google_drive_url || details?.assets.google_drive_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px',
                        backgroundColor: '#fff3bf',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        marginBottom: '12px',
                        border: '1px solid #ffd43b',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>📁</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#e67700', fontSize: '13px' }}>Google Drive Folder</div>
                        <div style={{ fontSize: '11px', color: '#856404' }}>Raw footage & assets</div>
                      </div>
                    </a>
                  )}

                  {/* Final MP4 */}
                  {(video.final_video_url || details?.assets.final_mp4_url) && (
                    <a
                      href={video.final_video_url || details?.assets.final_mp4_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px',
                        backgroundColor: '#d3f9d8',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        marginBottom: '12px',
                        border: '1px solid #69db7c',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>🎬</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#2b8a3e', fontSize: '13px' }}>Final MP4</div>
                        <div style={{ fontSize: '11px', color: '#40c057' }}>Ready for posting</div>
                      </div>
                    </a>
                  )}

                  {/* Posted URL */}
                  {video.posted_url && (
                    <a
                      href={video.posted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px',
                        backgroundColor: '#e7f5ff',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        marginBottom: '12px',
                        border: '1px solid #74c0fc',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>🔗</span>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#1971c2', fontSize: '13px' }}>Posted Video</div>
                        <div style={{ fontSize: '11px', color: '#339af0' }}>{video.posted_platform || 'View on platform'}</div>
                      </div>
                    </a>
                  )}

                  {/* Screenshots */}
                  {details?.assets.screenshots && details.assets.screenshots.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#868e96', textTransform: 'uppercase' }}>
                        Screenshots ({details.assets.screenshots.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {details.assets.screenshots.map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'block',
                              padding: '8px 12px',
                              backgroundColor: '#f8f9fa',
                              borderRadius: '4px',
                              textDecoration: 'none',
                              color: '#228be6',
                              fontSize: '12px',
                              border: '1px solid #e9ecef',
                            }}
                          >
                            Screenshot {idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No assets message */}
                  {!video.google_drive_url && !details?.assets.google_drive_url &&
                   !video.final_video_url && !details?.assets.final_mp4_url &&
                   !video.posted_url &&
                   (!details?.assets.screenshots || details.assets.screenshots.length === 0) && (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      color: '#868e96',
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                      <div>No assets linked yet</div>
                    </div>
                  )}
                </div>
              )}

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <div>
                  {details?.events && details.events.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {details.events.map((event) => (
                        <div
                          key={event.id}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '6px',
                            borderLeft: `3px solid ${
                              event.event_type === 'status_change' ? '#228be6' :
                              event.event_type === 'claimed' ? '#40c057' :
                              event.event_type === 'released' ? '#fab005' :
                              '#868e96'
                            }`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#212529', marginBottom: '2px' }}>
                                {event.event_type.replace(/_/g, ' ')}
                              </div>
                              {event.from_status && event.to_status && (
                                <div style={{ fontSize: '11px', color: '#495057' }}>
                                  {event.from_status} → {event.to_status}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '10px', color: '#868e96' }}>
                                {displayTime(event.created_at)}
                              </div>
                              <div style={{ fontSize: '10px', color: '#adb5bd', fontFamily: 'monospace' }}>
                                {event.actor.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      color: '#868e96',
                    }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                      <div>No activity yet</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#f8f9fa',
        }}>
          {/* Start/Put Back row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {isUnclaimed && (
              <button
                onClick={handleClaim}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                }}
              >
                ▶️ Start
              </button>
            )}
            {isClaimedByMe && (
              <button
                onClick={handleRelease}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                }}
              >
                ↩️ Put Back
              </button>
            )}
            {isClaimedByOther && (
              <div style={{
                flex: 1,
                padding: '10px',
                backgroundColor: '#fff3e0',
                borderRadius: '6px',
                textAlign: 'center',
                fontSize: '12px',
                color: '#e67700',
              }}>
                🔒 Assigned to {video.claimed_by?.slice(0, 8)}...
              </div>
            )}
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {onOpenHandoffModal && isClaimedByMe && (
                <button
                  onClick={() => onOpenHandoffModal(video)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#6f42c1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Handoff
                </button>
              )}
              {video.recording_status !== 'REJECTED' && video.recording_status !== 'POSTED' && (
                <button
                  onClick={handleReject}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#e03131',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
