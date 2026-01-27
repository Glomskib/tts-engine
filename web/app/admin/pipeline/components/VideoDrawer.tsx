'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { QueueVideo, AvailableScript } from '../types';
import { getStatusBadgeColor, getSlaColor, getPrimaryAction, getReadinessIndicators } from '../types';
import { formatDateString, getTimeAgo, useHydrated } from '@/lib/useHydrated';

interface VideoDrawerProps {
  video: QueueVideo;
  simpleMode: boolean;
  activeUser: string;
  onClose: () => void;
  onClaimVideo: (videoId: string) => Promise<void>;
  onReleaseVideo: (videoId: string) => Promise<void>;
  onExecuteTransition: (videoId: string, targetStatus: string) => Promise<void>;
  onOpenAttachModal: (video: QueueVideo) => void;
  onOpenPostModal: (video: QueueVideo) => void;
  onRefresh: () => void;
}

interface ChecklistItem {
  key: string;
  label: string;
  completed: boolean;
  required: boolean;
}

export default function VideoDrawer({
  video,
  simpleMode,
  activeUser,
  onClose,
  onClaimVideo,
  onReleaseVideo,
  onExecuteTransition,
  onOpenAttachModal,
  onOpenPostModal,
  onRefresh,
}: VideoDrawerProps) {
  const hydrated = useHydrated();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'script' | 'more'>('details');
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptMessage, setScriptMessage] = useState<string | null>(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [rewritingAI, setRewritingAI] = useState(false);

  const statusColors = getStatusBadgeColor(video.recording_status);
  const slaColors = getSlaColor(video.sla_status);
  const primaryAction = getPrimaryAction(video);
  const readiness = getReadinessIndicators(video);

  const isClaimedByMe = video.claimed_by === activeUser;
  const isClaimedByOther = !!(video.claimed_by && video.claimed_by !== activeUser &&
    (!video.claim_expires_at || new Date(video.claim_expires_at) > new Date()));
  const isUnclaimed = !video.claimed_by || !!(video.claim_expires_at && new Date(video.claim_expires_at) <= new Date());

  // Build checklist
  const checklist: ChecklistItem[] = [
    { key: 'script', label: 'Script attached and locked', completed: readiness.hasScript, required: true },
    { key: 'recorded', label: 'Video recorded', completed: readiness.hasRaw, required: true },
    { key: 'edited', label: 'Video edited', completed: video.recording_status === 'EDITED' || video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED', required: true },
    { key: 'approved', label: 'Ready for posting', completed: video.recording_status === 'READY_TO_POST' || video.recording_status === 'POSTED', required: true },
    { key: 'posted', label: 'Posted to platform', completed: video.recording_status === 'POSTED', required: true },
  ];

  const handlePrimaryAction = async () => {
    setLoading(true);
    try {
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

  // AI Script Generation
  const handleGenerateScript = async () => {
    if (!video.concept_id) {
      setScriptMessage('No concept linked to this video. Cannot generate script.');
      return;
    }

    setGeneratingAI(true);
    setScriptMessage(null);

    try {
      const res = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: video.concept_id,
          hook_text: 'Check this out!', // Default hook
          style_preset: 'engaging',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setScriptMessage('Script generated! Refresh to see available scripts.');
        onRefresh();
      } else {
        setScriptMessage(`Error: ${data.error || 'Failed to generate script'}`);
      }
    } catch (err) {
      setScriptMessage('Error: Network error generating script');
    } finally {
      setGeneratingAI(false);
    }
  };

  // AI Safer Rewrite
  const handleSaferRewrite = async () => {
    if (!video.script_locked_text) {
      setScriptMessage('No script attached. Generate or attach a script first.');
      return;
    }

    setRewritingAI(true);
    setScriptMessage(null);

    try {
      // Use the compliance/rewrite endpoint or script rewrite
      const res = await fetch('/api/scripts/rewrite-safer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: video.id,
          script_text: video.script_locked_text,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setScriptMessage('Safer rewrite complete! Refresh to see the new script.');
        onRefresh();
      } else {
        setScriptMessage(`Error: ${data.error || 'Failed to rewrite script'}`);
      }
    } catch (err) {
      setScriptMessage('Error: Network error rewriting script');
    } finally {
      setRewritingAI(false);
    }
  };

  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: simpleMode ? '320px' : '420px',
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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontSize: simpleMode ? '16px' : '14px', fontWeight: 'bold', marginBottom: '4px' }}>
            {video.product_name || video.id.slice(0, 12)}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{
              padding: '3px 10px',
              borderRadius: '12px',
              backgroundColor: statusColors.badge,
              color: 'white',
              fontSize: '11px',
              fontWeight: 'bold',
            }}>
              {(video.recording_status || 'NOT_RECORDED').replace(/_/g, ' ')}
            </span>
            <span style={{
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: slaColors.bg,
              color: slaColors.text,
              border: `1px solid ${slaColors.border}`,
              fontSize: '10px',
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
          ×
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e0e0e0',
      }}>
        {(['details', 'script', 'more'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: simpleMode ? '14px 8px' : '10px 8px',
              border: 'none',
              borderBottom: activeTab === tab ? '3px solid #228be6' : '3px solid transparent',
              backgroundColor: activeTab === tab ? '#f8f9fa' : 'transparent',
              cursor: 'pointer',
              fontSize: simpleMode ? '14px' : '13px',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              color: activeTab === tab ? '#228be6' : '#495057',
              textTransform: 'capitalize',
            }}
          >
            {simpleMode ? (tab === 'details' ? '📋' : tab === 'script' ? '📝' : '⚙️') : tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {activeTab === 'details' && (
          <div>
            {/* Checklist */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: simpleMode ? '15px' : '13px', color: '#495057' }}>
                {simpleMode ? '✅ Checklist' : 'Progress Checklist'}
              </h4>
              {checklist.map(item => (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: simpleMode ? '12px' : '8px',
                    marginBottom: '4px',
                    backgroundColor: item.completed ? '#d3f9d8' : '#f8f9fa',
                    borderRadius: '6px',
                    border: item.completed ? '1px solid #69db7c' : '1px solid #e0e0e0',
                  }}
                >
                  <span style={{ fontSize: simpleMode ? '20px' : '16px' }}>
                    {item.completed ? '✅' : '⬜'}
                  </span>
                  <span style={{
                    fontSize: simpleMode ? '14px' : '13px',
                    color: item.completed ? '#2b8a3e' : '#495057',
                    textDecoration: item.completed ? 'line-through' : 'none',
                  }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Next Action */}
            <div style={{
              padding: '16px',
              backgroundColor: '#e7f5ff',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <div style={{ fontSize: '12px', color: '#1971c2', marginBottom: '6px', fontWeight: 'bold' }}>
                NEXT ACTION
              </div>
              <div style={{ fontSize: simpleMode ? '16px' : '14px', color: '#212529' }}>
                {video.next_action}
              </div>
              {video.blocked_reason && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px',
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#856404',
                }}>
                  ⚠️ {video.blocked_reason}
                </div>
              )}
            </div>

            {/* Quick Info */}
            {!simpleMode && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#495057' }}>Details</h4>
                <table style={{ width: '100%', fontSize: '12px' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '4px 0', color: '#868e96' }}>Video ID</td>
                      <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{video.id.slice(0, 12)}...</td>
                    </tr>
                    {video.brand_name && (
                      <tr>
                        <td style={{ padding: '4px 0', color: '#868e96' }}>Brand</td>
                        <td style={{ padding: '4px 0' }}>{video.brand_name}</td>
                      </tr>
                    )}
                    {video.product_name && (
                      <tr>
                        <td style={{ padding: '4px 0', color: '#868e96' }}>Product</td>
                        <td style={{ padding: '4px 0' }}>{video.product_name}</td>
                      </tr>
                    )}
                    {video.account_name && (
                      <tr>
                        <td style={{ padding: '4px 0', color: '#868e96' }}>Target Account</td>
                        <td style={{ padding: '4px 0' }}>{video.account_name}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '4px 0', color: '#868e96' }}>Created</td>
                      <td style={{ padding: '4px 0' }}>{displayTime(video.created_at)}</td>
                    </tr>
                    {video.last_status_changed_at && (
                      <tr>
                        <td style={{ padding: '4px 0', color: '#868e96' }}>Last Update</td>
                        <td style={{ padding: '4px 0' }}>{displayTime(video.last_status_changed_at)}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '4px 0', color: '#868e96' }}>Time in Stage</td>
                      <td style={{ padding: '4px 0' }}>{Math.floor(video.age_minutes_in_stage / 60)}h {video.age_minutes_in_stage % 60}m</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'script' && (
          <div>
            {/* Script Preview */}
            {video.script_locked_text ? (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: simpleMode ? '15px' : '13px', color: '#495057' }}>
                  📝 Current Script {video.script_locked_version && `(v${video.script_locked_version})`}
                </h4>
                <div style={{
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #dee2e6',
                  fontSize: simpleMode ? '14px' : '13px',
                  lineHeight: 1.6,
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {video.script_locked_text}
                </div>
              </div>
            ) : (
              <div style={{
                padding: '20px',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                textAlign: 'center',
                marginBottom: '20px',
              }}>
                <div style={{ fontSize: simpleMode ? '32px' : '24px', marginBottom: '8px' }}>📝</div>
                <div style={{ fontSize: simpleMode ? '15px' : '13px', color: '#856404' }}>
                  No script attached yet
                </div>
              </div>
            )}

            {/* AI Script Tools */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: simpleMode ? '15px' : '13px', color: '#495057' }}>
                🤖 AI Script Tools
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={handleGenerateScript}
                  disabled={generatingAI || !video.concept_id}
                  style={{
                    padding: simpleMode ? '14px' : '12px',
                    backgroundColor: generatingAI || !video.concept_id ? '#ccc' : '#7950f2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: generatingAI || !video.concept_id ? 'not-allowed' : 'pointer',
                    fontSize: simpleMode ? '15px' : '13px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>✨</span>
                  {generatingAI ? 'Generating...' : 'Generate Script (AI)'}
                </button>

                <button
                  onClick={handleSaferRewrite}
                  disabled={rewritingAI || !video.script_locked_text}
                  style={{
                    padding: simpleMode ? '14px' : '12px',
                    backgroundColor: rewritingAI || !video.script_locked_text ? '#ccc' : '#20c997',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: rewritingAI || !video.script_locked_text ? 'not-allowed' : 'pointer',
                    fontSize: simpleMode ? '15px' : '13px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span>🛡️</span>
                  {rewritingAI ? 'Rewriting...' : 'Safer Rewrite (AI)'}
                </button>
              </div>

              {scriptMessage && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: scriptMessage.includes('Error') ? '#f8d7da' : '#d4edda',
                  color: scriptMessage.includes('Error') ? '#721c24' : '#155724',
                  fontSize: '12px',
                }}>
                  {scriptMessage}
                </div>
              )}

              {!video.concept_id && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: '#868e96',
                  fontStyle: 'italic',
                }}>
                  Note: No concept linked. AI generation requires a concept.
                </div>
              )}
            </div>

            {/* Attach Script Button */}
            <button
              onClick={() => onOpenAttachModal(video)}
              style={{
                width: '100%',
                padding: simpleMode ? '14px' : '12px',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: simpleMode ? '15px' : '13px',
                fontWeight: 'bold',
              }}
            >
              {video.script_locked_text ? 'Change Script' : 'Attach Script'}
            </button>
          </div>
        )}

        {activeTab === 'more' && (
          <div>
            {/* Claim Status */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: simpleMode ? '15px' : '13px', color: '#495057' }}>
                Claim Status
              </h4>
              <div style={{
                padding: '12px',
                backgroundColor: isClaimedByMe ? '#d3f9d8' : isClaimedByOther ? '#fff3e0' : '#f8f9fa',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ fontSize: simpleMode ? '14px' : '13px' }}>
                  {isClaimedByMe ? '✅ Claimed by you' : isClaimedByOther ? `🔒 Claimed by ${video.claimed_by?.slice(0, 8)}...` : '📭 Unclaimed'}
                </div>
                {isUnclaimed && (
                  <button
                    onClick={handleClaim}
                    disabled={loading}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Claim
                  </button>
                )}
                {isClaimedByMe && (
                  <button
                    onClick={handleRelease}
                    disabled={loading}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Release
                  </button>
                )}
              </div>
            </div>

            {/* Links */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: simpleMode ? '15px' : '13px', color: '#495057' }}>
                Links
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Link
                  href={`/admin/pipeline/${video.id}`}
                  target="_blank"
                  style={{
                    display: 'block',
                    padding: '12px',
                    backgroundColor: '#e7f5ff',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: '#1971c2',
                    fontSize: simpleMode ? '14px' : '13px',
                    textAlign: 'center',
                  }}
                >
                  📄 Open Full Details Page
                </Link>
                {video.google_drive_url && (
                  <a
                    href={video.google_drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      padding: '12px',
                      backgroundColor: '#fff3bf',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      color: '#e67700',
                      fontSize: simpleMode ? '14px' : '13px',
                      textAlign: 'center',
                    }}
                  >
                    📁 Google Drive Files
                  </a>
                )}
                {video.posted_url && (
                  <a
                    href={video.posted_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      padding: '12px',
                      backgroundColor: '#d3f9d8',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      color: '#2b8a3e',
                      fontSize: simpleMode ? '14px' : '13px',
                      textAlign: 'center',
                    }}
                  >
                    🔗 Posted Video ({video.posted_platform})
                  </a>
                )}
              </div>
            </div>

            {/* Quick Status Changes */}
            {!simpleMode && (
              <div>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', color: '#495057' }}>
                  Quick Actions
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {video.can_record && (
                    <button
                      onClick={() => onExecuteTransition(video.id, 'RECORDED')}
                      style={{
                        padding: '10px',
                        backgroundColor: '#228be6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Mark as Recorded
                    </button>
                  )}
                  {video.can_mark_edited && (
                    <button
                      onClick={() => onExecuteTransition(video.id, 'EDITED')}
                      style={{
                        padding: '10px',
                        backgroundColor: '#fab005',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Mark as Edited
                    </button>
                  )}
                  {video.can_mark_ready_to_post && (
                    <button
                      onClick={() => onExecuteTransition(video.id, 'READY_TO_POST')}
                      style={{
                        padding: '10px',
                        backgroundColor: '#40c057',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Mark Ready to Post
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with Primary Action */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid #e0e0e0',
        backgroundColor: '#f8f9fa',
      }}>
        <button
          onClick={handlePrimaryAction}
          disabled={loading || primaryAction.type === 'done' || isClaimedByOther}
          style={{
            width: '100%',
            padding: simpleMode ? '16px' : '14px',
            backgroundColor: loading || primaryAction.type === 'done' || isClaimedByOther ? '#ccc' : primaryAction.color,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading || primaryAction.type === 'done' || isClaimedByOther ? 'not-allowed' : 'pointer',
            fontSize: simpleMode ? '18px' : '15px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span>{primaryAction.icon}</span>
          {loading ? 'Processing...' : primaryAction.label}
        </button>
        {isClaimedByOther && (
          <div style={{
            textAlign: 'center',
            marginTop: '8px',
            fontSize: '12px',
            color: '#dc3545',
          }}>
            This video is being worked on by someone else
          </div>
        )}
      </div>
    </div>
  );
}
