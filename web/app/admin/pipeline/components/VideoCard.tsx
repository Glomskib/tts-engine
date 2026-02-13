'use client';

import { useState } from 'react';
import type { QueueVideo } from '../types';
import { getSlaColor, getPrimaryAction, getReadinessIndicators, getVideoDisplayTitle } from '../types';

interface VideoCardProps {
  video: QueueVideo;
  simpleMode: boolean;
  activeUser: string;
  onClick: () => void;
  onClaimVideo: (videoId: string) => Promise<void>;
  onReleaseVideo: (videoId: string) => Promise<void>;
  onExecuteTransition: (videoId: string, targetStatus: string) => Promise<void>;
  onOpenAttachModal: (video: QueueVideo) => void;
  onOpenPostModal: (video: QueueVideo) => void;
}

export default function VideoCard({
  video,
  simpleMode,
  activeUser,
  onClick,
  onClaimVideo,
  onReleaseVideo,
  onExecuteTransition,
  onOpenAttachModal,
  onOpenPostModal,
}: VideoCardProps) {
  const [loading, setLoading] = useState(false);

  const slaColors = getSlaColor(video.sla_status);
  const primaryAction = getPrimaryAction(video);
  const readiness = getReadinessIndicators(video);

  const isClaimedByMe = video.claimed_by === activeUser;
  const isClaimedByOther = !!(video.claimed_by && video.claimed_by !== activeUser &&
    (!video.claim_expires_at || new Date(video.claim_expires_at) > new Date()));
  const isUnclaimed = !video.claimed_by || !!(video.claim_expires_at && new Date(video.claim_expires_at) <= new Date());

  const handlePrimaryAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);

    try {
      switch (primaryAction.type) {
        case 'add_script':
          onOpenAttachModal(video);
          break;
        case 'record':
          await onExecuteTransition(video.id, 'RECORDED');
          break;
        case 'upload_edit':
          await onExecuteTransition(video.id, 'EDITED');
          break;
        case 'approve':
          await onExecuteTransition(video.id, 'READY_TO_POST');
          break;
        case 'post':
          onOpenPostModal(video);
          break;
        case 'view_rejection':
          onClick(); // Open drawer
          break;
        case 'done':
          // No action needed
          break;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await onClaimVideo(video.id);
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await onReleaseVideo(video.id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: isClaimedByMe ? '#e8f5e9' : isClaimedByOther ? '#fff3e0' : 'white',
        borderRadius: '8px',
        padding: simpleMode ? '10px' : '12px',
        border: '1px solid #e0e0e0',
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        transition: 'box-shadow 0.2s, transform 0.1s',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Top Row: SLA Badge + Brand */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: simpleMode ? '6px' : '8px',
      }}>
        {/* SLA Badge */}
        <span style={{
          padding: simpleMode ? '2px 6px' : '3px 8px',
          borderRadius: '4px',
          backgroundColor: slaColors.bg,
          color: slaColors.text,
          border: `1px solid ${slaColors.border}`,
          fontSize: simpleMode ? '9px' : '10px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
        }}>
          {simpleMode
            ? (video.sla_status === 'overdue' ? '!' : video.sla_status === 'due_soon' ? '~' : '')
            : (video.sla_status === 'overdue' ? 'OVERDUE' : video.sla_status === 'due_soon' ? 'DUE SOON' : 'OK')
          }
        </span>

        {/* Brand Name */}
        {video.brand_name && (
          <span style={{
            fontSize: simpleMode ? '10px' : '11px',
            color: '#6c757d',
            fontWeight: 'bold',
            maxWidth: '80px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {video.brand_name}
          </span>
        )}
      </div>

      {/* Product SKU */}
      {!simpleMode && (
        <div style={{
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#212529',
          marginBottom: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {getVideoDisplayTitle(video)}
        </div>
      )}

      {/* Target Account */}
      {!simpleMode && video.account_name && (
        <div style={{
          fontSize: '11px',
          color: '#868e96',
          marginBottom: '6px',
        }}>
          → {video.account_name}
        </div>
      )}

      {/* Readiness Indicators */}
      <div style={{
        display: 'flex',
        gap: simpleMode ? '6px' : '8px',
        marginBottom: simpleMode ? '8px' : '10px',
        fontSize: '11px',
      }}>
        <span
          title={readiness.hasScript ? 'Script attached' : 'No script'}
          style={{
            color: readiness.hasScript ? '#10B981' : '#9CA3AF',
            fontWeight: 500,
          }}
        >
          S
        </span>
        <span
          title={readiness.hasRaw ? 'Raw recorded' : 'Not recorded'}
          style={{
            color: readiness.hasRaw ? '#10B981' : '#9CA3AF',
            fontWeight: 500,
          }}
        >
          R
        </span>
        <span
          title={readiness.hasFinal ? 'Final ready' : 'No final'}
          style={{
            color: readiness.hasFinal ? '#10B981' : '#9CA3AF',
            fontWeight: 500,
          }}
        >
          F
        </span>
      </div>

      {/* Next Action Label */}
      {!simpleMode && (
        <div style={{
          fontSize: '11px',
          color: '#495057',
          marginBottom: '10px',
          fontStyle: 'italic',
        }}>
          {video.next_action}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
      }}>
        {/* Primary Action Button */}
        {primaryAction.type !== 'done' && (
          <button type="button"
            onClick={handlePrimaryAction}
            disabled={loading || isClaimedByOther}
            style={{
              flex: 1,
              padding: simpleMode ? '10px 8px' : '8px 12px',
              backgroundColor: loading || isClaimedByOther ? '#ccc' : primaryAction.color,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading || isClaimedByOther ? 'not-allowed' : 'pointer',
              fontSize: simpleMode ? '14px' : '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            {simpleMode && <span>{primaryAction.icon}</span>}
            {loading ? '...' : (simpleMode ? primaryAction.shortLabel : primaryAction.label)}
          </button>
        )}

        {/* Claim/Release Button */}
        {!simpleMode && (
          <>
            {isUnclaimed && (
              <button type="button"
                onClick={handleClaim}
                disabled={loading}
                style={{
                  padding: '8px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                }}
                title="Claim this video"
              >
                Claim
              </button>
            )}
            {isClaimedByMe && (
              <button type="button"
                onClick={handleRelease}
                disabled={loading}
                style={{
                  padding: '8px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                }}
                title="Release this video"
              >
                Release
              </button>
            )}
          </>
        )}
      </div>

      {/* Claimed By Indicator */}
      {isClaimedByOther && (
        <div style={{
          marginTop: '8px',
          fontSize: '10px',
          color: '#dc3545',
          textAlign: 'center',
        }}>
          {simpleMode ? 'Locked' : `Locked by ${video.claimed_by?.slice(0, 8)}...`}
        </div>
      )}

      {/* Done State */}
      {primaryAction.type === 'done' && (
        <div style={{
          textAlign: 'center',
          padding: '8px',
          color: '#40c057',
          fontWeight: 'bold',
          fontSize: simpleMode ? '14px' : '12px',
        }}>
          {simpleMode ? 'Done' : 'Complete'}
        </div>
      )}
    </div>
  );
}
