'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';

interface ClaimedVideo {
  id: string;
  claimed_by: string;
  claimed_at: string;
  claim_expires_at: string;
}

interface VideoEvent {
  id: string;
  video_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  correlation_id: string;
  actor: string;
  created_at: string;
}

interface VideoDetail {
  id: string;
  script_id: string | null;
  script_locked_json: Record<string, unknown> | null;
  script_locked_text: string | null;
  status: string | null;
  // Execution tracking fields
  recording_status: string;
  recorded_at: string | null;
  edited_at: string | null;
  ready_to_post_at: string | null;
  posted_at: string | null;
  rejected_at: string | null;
  recording_notes: string | null;
  editor_notes: string | null;
  uploader_notes: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  posted_account: string | null;
  posted_at_local: string | null;
  posting_error: string | null;
  last_status_changed_at: string | null;
}

const RECORDING_STATUSES = ['NOT_RECORDED', 'RECORDED', 'EDITED', 'READY_TO_POST', 'POSTED', 'REJECTED'] as const;
const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'other'] as const;

// Status badge color helper
function getStatusBadgeColor(status: string | null): { bg: string; border: string; badge: string } {
  switch (status) {
    case 'NOT_RECORDED':
      return { bg: '#f8f9fa', border: '#dee2e6', badge: '#6c757d' };
    case 'RECORDED':
      return { bg: '#e7f5ff', border: '#74c0fc', badge: '#228be6' };
    case 'EDITED':
      return { bg: '#fff3bf', border: '#ffd43b', badge: '#fab005' };
    case 'READY_TO_POST':
      return { bg: '#d3f9d8', border: '#69db7c', badge: '#40c057' };
    case 'POSTED':
      return { bg: '#d0ebff', border: '#339af0', badge: '#1971c2' };
    case 'REJECTED':
      return { bg: '#ffe3e3', border: '#ff8787', badge: '#e03131' };
    default:
      return { bg: '#f8f9fa', border: '#dee2e6', badge: '#6c757d' };
  }
}

interface ScriptInfo {
  id: string;
  title: string | null;
  status: string;
  version: number;
}

interface Script {
  id: string;
  title: string | null;
  status: string;
  version: number;
  script_text: string | null;
}

interface TimelineItem {
  ts: string;
  type: 'event' | 'assignment' | 'video_snapshot';
  label: string;
  metadata: Record<string, unknown>;
}

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params.id as string;
  const hydrated = useHydrated();

  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [claimedInfo, setClaimedInfo] = useState<ClaimedVideo | null>(null);
  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [linkedScript, setLinkedScript] = useState<ScriptInfo | null>(null);
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);

  // Script attachment state
  const [showAttachScript, setShowAttachScript] = useState(false);
  const [availableScripts, setAvailableScripts] = useState<Script[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState<string>('');
  const [attaching, setAttaching] = useState(false);
  const [attachMessage, setAttachMessage] = useState<string | null>(null);
  const [forceOverwrite, setForceOverwrite] = useState(false);

  // Execution tracking state
  const [executionForm, setExecutionForm] = useState({
    recording_status: 'NOT_RECORDED',
    recording_notes: '',
    editor_notes: '',
    uploader_notes: '',
    posted_url: '',
    posted_platform: '',
    posted_account: '',
    posted_at_local: '',
    posting_error: '',
  });
  const [savingExecution, setSavingExecution] = useState(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  // Timeline state
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Admin Actions state
  const [showAdminActions, setShowAdminActions] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionMessage, setAdminActionMessage] = useState<string | null>(null);
  const [forceStatusTarget, setForceStatusTarget] = useState('');
  const [forceStatusReason, setForceStatusReason] = useState('');
  const [forceStatusPostedUrl, setForceStatusPostedUrl] = useState('');
  const [forceStatusPostedPlatform, setForceStatusPostedPlatform] = useState('');
  const [clearClaimReason, setClearClaimReason] = useState('');
  const [resetMode, setResetMode] = useState<'expire' | 'unassign'>('expire');
  const [resetReason, setResetReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState<'clear-claim' | 'reset' | null>(null);

  const checkAdminEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enabled');
      const data = await res.json();
      setAdminEnabled(data.enabled === true);
    } catch {
      setAdminEnabled(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);
    try {
      const [claimedRes, eventsRes, videoRes] = await Promise.all([
        fetch('/api/observability/claimed'),
        fetch(`/api/videos/${videoId}/events`),
        fetch(`/api/videos/${videoId}`),
      ]);

      const [claimedData, eventsData, videoData] = await Promise.all([
        claimedRes.json(),
        eventsRes.json(),
        videoRes.json(),
      ]);

      // Find if this video is currently claimed
      if (claimedData.ok && claimedData.data) {
        const claimed = claimedData.data.find((v: ClaimedVideo) => v.id === videoId);
        setClaimedInfo(claimed || null);
      }

      // Set events for this video (already filtered by the API)
      if (eventsData.ok && eventsData.data) {
        setEvents(eventsData.data);
      }

      // Set video details (for script info)
      if (videoData.ok && videoData.data) {
        setVideoDetail(videoData.data);

        // Populate execution form with current values
        setExecutionForm({
          recording_status: videoData.data.recording_status || 'NOT_RECORDED',
          recording_notes: videoData.data.recording_notes || '',
          editor_notes: videoData.data.editor_notes || '',
          uploader_notes: videoData.data.uploader_notes || '',
          posted_url: videoData.data.posted_url || '',
          posted_platform: videoData.data.posted_platform || '',
          posted_account: videoData.data.posted_account || '',
          posted_at_local: videoData.data.posted_at_local || '',
          posting_error: videoData.data.posting_error || '',
        });

        // If video has a linked script, fetch its current status/version
        if (videoData.data.script_id) {
          try {
            const scriptRes = await fetch(`/api/scripts/${videoData.data.script_id}`);
            const scriptData = await scriptRes.json();
            if (scriptData.ok && scriptData.data) {
              setLinkedScript({
                id: scriptData.data.id,
                title: scriptData.data.title,
                status: scriptData.data.status,
                version: scriptData.data.version,
              });
            }
          } catch {
            // Script fetch failed, leave linkedScript null
          }
        } else {
          setLinkedScript(null);
        }
      }

      setError('');
    } catch (err) {
      setError('Failed to fetch video data');
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  const fetchAvailableScripts = useCallback(async () => {
    setScriptsLoading(true);
    try {
      const res = await fetch('/api/scripts?status=APPROVED');
      const data = await res.json();
      if (data.ok) {
        setAvailableScripts(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch scripts:', err);
    } finally {
      setScriptsLoading(false);
    }
  }, []);

  const fetchTimeline = useCallback(async () => {
    if (!videoId) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/timeline?limit=50`);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          // Not admin or not authenticated, skip timeline
          setTimelineItems([]);
          return;
        }
        throw new Error('Failed to fetch timeline');
      }
      const data = await res.json();
      if (data.ok && data.data?.items) {
        setTimelineItems(data.data.items);
      }
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : 'Failed to fetch timeline');
    } finally {
      setTimelineLoading(false);
    }
  }, [videoId]);

  // Admin Action Handlers
  const handleForceStatus = async () => {
    if (!forceStatusTarget || !forceStatusReason.trim()) {
      setAdminActionMessage('Error: Target status and reason are required');
      return;
    }
    if (forceStatusTarget === 'POSTED' && (!forceStatusPostedUrl.trim() || !forceStatusPostedPlatform)) {
      setAdminActionMessage('Error: Posted URL and platform are required for POSTED status');
      return;
    }

    setAdminActionLoading(true);
    setAdminActionMessage(null);
    try {
      const payload: Record<string, string> = {
        target_status: forceStatusTarget,
        reason: forceStatusReason.trim(),
      };
      if (forceStatusTarget === 'POSTED') {
        payload.posted_url = forceStatusPostedUrl.trim();
        payload.posted_platform = forceStatusPostedPlatform;
      }

      const res = await fetch(`/api/admin/videos/${videoId}/force-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminActionMessage(`Success: Status forced to ${forceStatusTarget}`);
        setForceStatusTarget('');
        setForceStatusReason('');
        setForceStatusPostedUrl('');
        setForceStatusPostedPlatform('');
        fetchData();
        fetchTimeline();
      } else {
        setAdminActionMessage(`Error: ${data.message || data.error || 'Failed to force status'}`);
      }
    } catch (err) {
      setAdminActionMessage('Error: Failed to force status');
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleClearClaim = async () => {
    if (!clearClaimReason.trim()) {
      setAdminActionMessage('Error: Reason is required');
      return;
    }

    setAdminActionLoading(true);
    setAdminActionMessage(null);
    setShowConfirmModal(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/clear-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: clearClaimReason.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminActionMessage('Success: Claim cleared');
        setClearClaimReason('');
        fetchData();
        fetchTimeline();
      } else {
        setAdminActionMessage(`Error: ${data.message || data.error || 'Failed to clear claim'}`);
      }
    } catch (err) {
      setAdminActionMessage('Error: Failed to clear claim');
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleResetAssignments = async () => {
    if (!resetReason.trim()) {
      setAdminActionMessage('Error: Reason is required');
      return;
    }

    setAdminActionLoading(true);
    setAdminActionMessage(null);
    setShowConfirmModal(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/reset-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: resetMode, reason: resetReason.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminActionMessage(`Success: Assignments reset (${resetMode})`);
        setResetReason('');
        fetchData();
        fetchTimeline();
      } else {
        setAdminActionMessage(`Error: ${data.message || data.error || 'Failed to reset assignments'}`);
      }
    } catch (err) {
      setAdminActionMessage('Error: Failed to reset assignments');
    } finally {
      setAdminActionLoading(false);
    }
  };

  const attachScript = async () => {
    if (!selectedScriptId) return;
    setAttaching(true);
    setAttachMessage(null);
    try {
      const payload: { script_id: string; force?: boolean } = { script_id: selectedScriptId };
      if (forceOverwrite) {
        payload.force = true;
      }
      const res = await fetch(`/api/videos/${videoId}/attach-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setAttachMessage('Script attached successfully');
        setShowAttachScript(false);
        setSelectedScriptId('');
        setForceOverwrite(false);
        fetchData();
      } else if (data.code === 'SCRIPT_ALREADY_LOCKED') {
        setAttachMessage('This video already has a locked script. Check "Overwrite existing" to replace it.');
      } else if (data.code === 'SCRIPT_NOT_APPROVED') {
        setAttachMessage(`Script is not approved (status: ${data.details?.status || 'unknown'}). Check "Force attach" to attach anyway.`);
      } else {
        setAttachMessage(`Error: ${data.error || 'Failed to attach script'}`);
      }
    } catch (err) {
      setAttachMessage('Error: Failed to attach script');
    } finally {
      setAttaching(false);
    }
  };

  // Client-side validation for status transitions
  const validateStatusTransition = (status: string): string | null => {
    if (status === 'POSTED') {
      if (!executionForm.posted_url || !executionForm.posted_url.trim()) {
        return 'Posted URL is required when setting status to POSTED';
      }
      if (!executionForm.posted_platform) {
        return 'Platform is required when setting status to POSTED';
      }
    }
    if (status === 'REJECTED') {
      const hasNotes = (executionForm.recording_notes && executionForm.recording_notes.trim()) ||
                       (executionForm.editor_notes && executionForm.editor_notes.trim()) ||
                       (executionForm.uploader_notes && executionForm.uploader_notes.trim());
      if (!hasNotes) {
        return 'At least one notes field (Recording, Editor, or Uploader Notes) is required when setting status to REJECTED';
      }
    }
    return null;
  };

  const saveExecution = async () => {
    // Client-side validation
    const validationError = validateStatusTransition(executionForm.recording_status);
    if (validationError) {
      setExecutionMessage(`Error: ${validationError}`);
      return;
    }

    setSavingExecution(true);
    setExecutionMessage(null);
    try {
      const payload: Record<string, unknown> = {
        recording_status: executionForm.recording_status,
        recording_notes: executionForm.recording_notes || null,
        editor_notes: executionForm.editor_notes || null,
        uploader_notes: executionForm.uploader_notes || null,
        posted_url: executionForm.posted_url || null,
        posted_platform: executionForm.posted_platform || null,
        posted_account: executionForm.posted_account || null,
        posted_at_local: executionForm.posted_at_local || null,
        posting_error: executionForm.posting_error || null,
      };

      const res = await fetch(`/api/videos/${videoId}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setExecutionMessage('Execution status saved successfully');
        fetchData();
        setTimeout(() => setExecutionMessage(null), 3000);
      } else {
        setExecutionMessage(`Error: ${data.error || 'Failed to save'}`);
      }
    } catch (err) {
      setExecutionMessage('Error: Failed to save execution status');
    } finally {
      setSavingExecution(false);
    }
  };

  const setTimestampNow = async (field: 'recorded_at' | 'edited_at' | 'ready_to_post_at' | 'posted_at' | 'rejected_at') => {
    const statusMap: Record<string, string> = {
      recorded_at: 'RECORDED',
      edited_at: 'EDITED',
      ready_to_post_at: 'READY_TO_POST',
      posted_at: 'POSTED',
      rejected_at: 'REJECTED',
    };
    const newStatus = statusMap[field];

    // Client-side validation for POSTED and REJECTED
    const validationError = validateStatusTransition(newStatus);
    if (validationError) {
      setExecutionMessage(`Error: ${validationError}`);
      return;
    }

    setSavingExecution(true);
    setExecutionMessage(null);
    try {
      const payload: Record<string, unknown> = {
        recording_status: newStatus,
        [field]: new Date().toISOString(),
      };

      // If setting to POSTED, include the form fields
      if (newStatus === 'POSTED') {
        payload.posted_url = executionForm.posted_url || null;
        payload.posted_platform = executionForm.posted_platform || null;
        payload.posted_account = executionForm.posted_account || null;
      }

      // If setting to REJECTED, include notes
      if (newStatus === 'REJECTED') {
        payload.recording_notes = executionForm.recording_notes || null;
        payload.editor_notes = executionForm.editor_notes || null;
        payload.uploader_notes = executionForm.uploader_notes || null;
      }

      const res = await fetch(`/api/videos/${videoId}/execution`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setExecutionMessage(`Set ${field.replace(/_/g, ' ')} to now`);
        setExecutionForm(prev => ({ ...prev, recording_status: newStatus }));
        fetchData();
        setTimeout(() => setExecutionMessage(null), 3000);
      } else {
        setExecutionMessage(`Error: ${data.error || 'Failed to set timestamp'}`);
      }
    } catch (err) {
      setExecutionMessage('Error: Failed to set timestamp');
    } finally {
      setSavingExecution(false);
    }
  };

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchData();
      fetchTimeline();
    }
  }, [adminEnabled, fetchData, fetchTimeline]);

  useEffect(() => {
    if (showAttachScript) {
      fetchAvailableScripts();
    }
  }, [showAttachScript, fetchAvailableScripts]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(label);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const releaseVideo = async () => {
    if (!claimedInfo) return;
    setReleasing(true);
    setReleaseMessage(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimed_by: claimedInfo.claimed_by, force: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setReleaseMessage('Claim released successfully');
        fetchData();
      } else {
        setReleaseMessage(`Error: ${data.message || data.error || 'Failed to release'}`);
      }
    } catch (err) {
      setReleaseMessage('Error: Failed to release claim');
    } finally {
      setReleasing(false);
    }
  };

  // Use hydration-safe time display
  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  // Derive current status from most recent event
  const currentStatus = events.length > 0 ? events[0].to_status : null;

  if (adminEnabled === null) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (adminEnabled === false) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>404 - Not Found</h1>
        <p>This page is not available.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading video details...</div>;
  }

  const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '20px' };
  const thStyle = { border: '1px solid #ccc', padding: '8px', textAlign: 'left' as const, backgroundColor: '#f5f5f5' };
  const tdStyle = { border: '1px solid #ccc', padding: '8px' };
  const copyableCellStyle = { ...tdStyle, fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer' };
  const sectionStyle = { marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Navigation */}
      <div style={{ marginBottom: '20px' }}>
        <Link href="/admin/pipeline" style={{ padding: '8px 16px', marginRight: '10px', textDecoration: 'none', color: '#333', border: '1px solid #ccc', borderRadius: '4px', display: 'inline-block' }}>
          &larr; Back to Pipeline
        </Link>
        <button onClick={fetchData} style={{ padding: '8px 16px' }}>
          Refresh
        </button>
      </div>

      <h1>Video Details</h1>

      {/* Recording Status Badge - Prominent Display */}
      {videoDetail && (
        <div style={{
          marginBottom: '20px',
          padding: '15px 20px',
          backgroundColor: getStatusBadgeColor(videoDetail.recording_status).bg,
          border: `2px solid ${getStatusBadgeColor(videoDetail.recording_status).border}`,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#333' }}>Recording Status:</span>
            <span style={{
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: getStatusBadgeColor(videoDetail.recording_status).badge,
              color: 'white',
              fontWeight: 'bold',
              fontSize: '14px',
              letterSpacing: '0.5px',
            }}>
              {videoDetail.recording_status?.replace(/_/g, ' ') || 'NOT RECORDED'}
            </span>
          </div>
          {videoDetail.last_status_changed_at && (
            <div style={{ fontSize: '13px', color: '#555' }}>
              <span style={{ fontWeight: '500' }}>Last changed:</span>{' '}
              <span title={formatDateString(videoDetail.last_status_changed_at)}>
                {hydrated ? getTimeAgo(videoDetail.last_status_changed_at) : formatDateString(videoDetail.last_status_changed_at)}
              </span>
            </div>
          )}
        </div>
      )}

      {error && <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>}
      {releaseMessage && (
        <div style={{ color: releaseMessage.startsWith('Error') ? 'red' : 'green', marginBottom: '20px' }}>
          {releaseMessage}
        </div>
      )}

      {/* Video Overview */}
      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>Video Overview</h2>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '5px 20px 5px 0', fontWeight: 'bold' }}>Video ID:</td>
              <td style={{ fontFamily: 'monospace' }}>
                {videoId}
                <span
                  onClick={() => copyToClipboard(videoId, 'video-id')}
                  style={{ marginLeft: '10px', cursor: 'pointer', color: '#0066cc' }}
                  title="Copy"
                >
                  [copy]
                </span>
                {copiedId === 'video-id' && <span style={{ marginLeft: '5px', color: 'green', fontSize: '12px' }}>Copied!</span>}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '5px 20px 5px 0', fontWeight: 'bold' }}>Status:</td>
              <td>{currentStatus ? currentStatus.replace(/_/g, ' ').toUpperCase() : 'Unknown'}</td>
            </tr>
            <tr>
              <td style={{ padding: '5px 20px 5px 0', fontWeight: 'bold' }}>Claimed By:</td>
              <td>{claimedInfo ? claimedInfo.claimed_by : <span style={{ color: '#999' }}>Not claimed</span>}</td>
            </tr>
            {claimedInfo && (
              <>
                <tr>
                  <td style={{ padding: '5px 20px 5px 0', fontWeight: 'bold' }}>Claimed At:</td>
                  <td title={formatDateString(claimedInfo.claimed_at)}>{displayTime(claimedInfo.claimed_at)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 20px 5px 0', fontWeight: 'bold' }}>Expires:</td>
                  <td title={formatDateString(claimedInfo.claim_expires_at)}>{displayTime(claimedInfo.claim_expires_at)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </section>

      {/* Actions */}
      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>Actions</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={releaseVideo}
            disabled={!claimedInfo || releasing}
            style={{
              padding: '8px 16px',
              backgroundColor: claimedInfo ? '#dc3545' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: claimedInfo ? 'pointer' : 'not-allowed',
            }}
          >
            {releasing ? 'Releasing...' : 'Release Claim'}
          </button>
          <button
            onClick={() => setShowAttachScript(!showAttachScript)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {showAttachScript ? 'Cancel' : 'Attach Script'}
          </button>
          <Link
            href="/admin/scripts"
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Scripts Library
          </Link>
        </div>
        {claimedInfo && (
          <div style={{ marginTop: '10px', color: '#666', fontSize: '14px' }}>
            Currently claimed by {claimedInfo.claimed_by}
          </div>
        )}
      </section>

      {/* Admin Actions Card */}
      <section style={{ ...sectionStyle, borderColor: '#e03131', backgroundColor: '#fff5f5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ marginTop: 0, color: '#c92a2a' }}>Admin Actions</h2>
          <button
            onClick={() => setShowAdminActions(!showAdminActions)}
            style={{
              padding: '6px 12px',
              backgroundColor: showAdminActions ? '#868e96' : '#e03131',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {showAdminActions ? 'Hide' : 'Show Actions'}
          </button>
        </div>

        <div style={{ padding: '10px', backgroundColor: '#ffe8cc', border: '1px solid #ffa94d', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' }}>
          <strong>Warning:</strong> Admin actions are for fixing stuck items only. All actions are logged.
        </div>

        {adminActionMessage && (
          <div style={{
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: adminActionMessage.startsWith('Error') ? '#fff5f5' : '#d3f9d8',
            border: `1px solid ${adminActionMessage.startsWith('Error') ? '#ff8787' : '#69db7c'}`,
            borderRadius: '4px',
            color: adminActionMessage.startsWith('Error') ? '#c92a2a' : '#2f9e44',
            fontSize: '13px',
          }}>
            {adminActionMessage}
          </div>
        )}

        {showAdminActions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Force Status */}
            <div style={{ padding: '15px', backgroundColor: '#fff', border: '1px solid #dee2e6', borderRadius: '4px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>Force Status</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Target Status</label>
                  <select
                    value={forceStatusTarget}
                    onChange={(e) => setForceStatusTarget(e.target.value)}
                    style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px' }}
                  >
                    <option value="">Select...</option>
                    <option value="NOT_RECORDED">NOT_RECORDED</option>
                    <option value="RECORDED">RECORDED</option>
                    <option value="EDITED">EDITED</option>
                    <option value="READY_TO_POST">READY_TO_POST</option>
                    <option value="POSTED">POSTED</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Reason *</label>
                  <input
                    type="text"
                    value={forceStatusReason}
                    onChange={(e) => setForceStatusReason(e.target.value)}
                    placeholder="Why is this change needed?"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>
                <button
                  onClick={handleForceStatus}
                  disabled={adminActionLoading || !forceStatusTarget || !forceStatusReason.trim()}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: forceStatusTarget && forceStatusReason.trim() ? '#e03131' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: forceStatusTarget && forceStatusReason.trim() ? 'pointer' : 'not-allowed',
                    opacity: adminActionLoading ? 0.7 : 1,
                  }}
                >
                  {adminActionLoading ? 'Processing...' : 'Force Status'}
                </button>
              </div>
              {forceStatusTarget === 'POSTED' && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Posted URL *</label>
                    <input
                      type="text"
                      value={forceStatusPostedUrl}
                      onChange={(e) => setForceStatusPostedUrl(e.target.value)}
                      placeholder="https://..."
                      style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '250px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Platform *</label>
                    <select
                      value={forceStatusPostedPlatform}
                      onChange={(e) => setForceStatusPostedPlatform(e.target.value)}
                      style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    >
                      <option value="">Select...</option>
                      <option value="tiktok">TikTok</option>
                      <option value="instagram">Instagram</option>
                      <option value="youtube">YouTube</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Clear Claim */}
            <div style={{ padding: '15px', backgroundColor: '#fff', border: '1px solid #dee2e6', borderRadius: '4px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>Clear Claim</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Reason *</label>
                  <input
                    type="text"
                    value={clearClaimReason}
                    onChange={(e) => setClearClaimReason(e.target.value)}
                    placeholder="Why clear this claim?"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>
                <button
                  onClick={() => clearClaimReason.trim() && setShowConfirmModal('clear-claim')}
                  disabled={adminActionLoading || !clearClaimReason.trim()}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: clearClaimReason.trim() ? '#fd7e14' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: clearClaimReason.trim() ? 'pointer' : 'not-allowed',
                    opacity: adminActionLoading ? 0.7 : 1,
                  }}
                >
                  Clear Claim...
                </button>
              </div>
            </div>

            {/* Reset Assignments */}
            <div style={{ padding: '15px', backgroundColor: '#fff', border: '1px solid #dee2e6', borderRadius: '4px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px' }}>Reset Assignments</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Mode</label>
                  <select
                    value={resetMode}
                    onChange={(e) => setResetMode(e.target.value as 'expire' | 'unassign')}
                    style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  >
                    <option value="expire">Expire (mark as EXPIRED)</option>
                    <option value="unassign">Unassign (clear all)</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Reason *</label>
                  <input
                    type="text"
                    value={resetReason}
                    onChange={(e) => setResetReason(e.target.value)}
                    placeholder="Why reset assignments?"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>
                <button
                  onClick={() => resetReason.trim() && setShowConfirmModal('reset')}
                  disabled={adminActionLoading || !resetReason.trim()}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: resetReason.trim() ? '#fd7e14' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: resetReason.trim() ? 'pointer' : 'not-allowed',
                    opacity: adminActionLoading ? 0.7 : 1,
                  }}
                >
                  Reset...
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '25px',
              borderRadius: '8px',
              maxWidth: '400px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}>
              <h3 style={{ marginTop: 0, color: '#e03131' }}>Confirm Action</h3>
              <p style={{ color: '#495057' }}>
                {showConfirmModal === 'clear-claim'
                  ? 'Are you sure you want to clear the claim on this video? This action will be logged.'
                  : `Are you sure you want to ${resetMode === 'expire' ? 'expire' : 'unassign'} this video? This action will be logged.`}
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  onClick={() => setShowConfirmModal(null)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#868e96',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={showConfirmModal === 'clear-claim' ? handleClearClaim : handleResetAssignments}
                  disabled={adminActionLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#e03131',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    opacity: adminActionLoading ? 0.7 : 1,
                  }}
                >
                  {adminActionLoading ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Attach Script Form */}
      {showAttachScript && (
        <section style={{ ...sectionStyle, borderColor: '#0066cc', backgroundColor: '#f0f7ff' }}>
          <h2 style={{ marginTop: 0, color: '#004085' }}>Attach Approved Script</h2>
          {attachMessage && (
            <div style={{ color: attachMessage.startsWith('Error') ? 'red' : 'green', marginBottom: '15px' }}>
              {attachMessage}
            </div>
          )}
          {scriptsLoading ? (
            <p>Loading approved scripts...</p>
          ) : availableScripts.length === 0 ? (
            <p style={{ color: '#666' }}>No approved scripts available. <Link href="/admin/scripts" style={{ color: '#0066cc' }}>Create one</Link></p>
          ) : (
            <>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Select Script</label>
                <select
                  value={selectedScriptId}
                  onChange={(e) => setSelectedScriptId(e.target.value)}
                  style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '300px' }}
                >
                  <option value="">-- Select a script --</option>
                  {availableScripts.map((script) => (
                    <option key={script.id} value={script.id}>
                      {script.title || script.id.slice(0, 8)} (v{script.version})
                    </option>
                  ))}
                </select>
              </div>
              {selectedScriptId && (
                <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '4px' }}>
                  <strong>Preview:</strong>
                  <pre style={{ marginTop: '10px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px', maxHeight: '150px', overflow: 'auto' }}>
                    {availableScripts.find(s => s.id === selectedScriptId)?.script_text || 'No preview available'}
                  </pre>
                </div>
              )}
              {videoDetail?.script_locked_json && (
                <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
                  <strong style={{ color: '#856404' }}>Warning:</strong>
                  <span style={{ color: '#856404', marginLeft: '5px' }}>This video already has a locked script.</span>
                </div>
              )}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={forceOverwrite}
                    onChange={(e) => setForceOverwrite(e.target.checked)}
                  />
                  <span>Overwrite existing / Force attach unapproved script</span>
                </label>
              </div>
              <button
                onClick={attachScript}
                disabled={!selectedScriptId || attaching}
                style={{
                  padding: '8px 16px',
                  backgroundColor: selectedScriptId ? '#28a745' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedScriptId ? 'pointer' : 'not-allowed',
                }}
              >
                {attaching ? 'Attaching...' : 'Attach Script to Video'}
              </button>
            </>
          )}
        </section>
      )}

      {/* Locked Script Section */}
      {videoDetail?.script_locked_text && (
        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>Locked Script</h2>
          <div style={{
            marginBottom: '15px',
            padding: '10px 15px',
            backgroundColor: '#e8f4fd',
            border: '1px solid #bee5eb',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#0c5460',
          }}>
            <strong>Script Lock Explained:</strong> This video has a locked copy of its script.
            Even if the source script is later edited, this video&apos;s locked content won&apos;t change.
            This ensures the video being produced matches exactly what was approved.
          </div>
          {videoDetail.script_id && (
            <div style={{ marginBottom: '10px' }}>
              <span style={{ color: '#666' }}>Script ID: </span>
              <code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>
                {videoDetail.script_id}
              </code>
              {linkedScript && (
                <>
                  <span style={{ marginLeft: '10px', padding: '2px 8px', borderRadius: '4px', backgroundColor: linkedScript.status === 'APPROVED' ? '#d4edda' : '#fff3cd', color: linkedScript.status === 'APPROVED' ? '#155724' : '#856404', fontSize: '11px' }}>
                    {linkedScript.status}
                  </span>
                  <span style={{ marginLeft: '6px', color: '#666', fontSize: '12px' }}>
                    v{linkedScript.version}
                  </span>
                </>
              )}
              <Link href={`/admin/scripts/${videoDetail.script_id}`} style={{ marginLeft: '10px', color: '#0066cc', fontSize: '12px' }}>
                View Script
              </Link>
            </div>
          )}
          <pre style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', maxHeight: '300px', overflow: 'auto' }}>
            {videoDetail.script_locked_text}
          </pre>
          {videoDetail.script_locked_json && (
            <details style={{ marginTop: '15px' }}>
              <summary style={{ cursor: 'pointer', color: '#0066cc' }}>View JSON Structure</summary>
              <pre style={{ marginTop: '10px', backgroundColor: '#f9f9f9', padding: '10px', borderRadius: '4px', fontSize: '11px', overflow: 'auto' }}>
                {JSON.stringify(videoDetail.script_locked_json, null, 2)}
              </pre>
            </details>
          )}
        </section>
      )}

      {/* Execution Tracking Section */}
      <section style={{ ...sectionStyle, borderColor: '#28a745' }}>
        <h2 style={{ marginTop: 0 }}>Execution Tracking</h2>
        {executionMessage && (
          <div style={{ color: executionMessage.startsWith('Error') ? 'red' : 'green', marginBottom: '15px', padding: '10px', backgroundColor: executionMessage.startsWith('Error') ? '#fee' : '#efe', borderRadius: '4px' }}>
            {executionMessage}
          </div>
        )}

        {/* Recording Status */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Recording Status</label>
          <select
            value={executionForm.recording_status}
            onChange={(e) => setExecutionForm(prev => ({ ...prev, recording_status: e.target.value }))}
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '200px' }}
          >
            {RECORDING_STATUSES.map(status => (
              <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {/* Required fields hint */}
          {executionForm.recording_status === 'POSTED' && (
            <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', fontSize: '13px', color: '#856404' }}>
              <strong>Required for POSTED:</strong> Platform and Posted URL must be filled in below.
            </div>
          )}
          {executionForm.recording_status === 'REJECTED' && (
            <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px', fontSize: '13px', color: '#721c24' }}>
              <strong>Required for REJECTED:</strong> At least one Notes field must be filled in to explain the reason.
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Recorded At</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>
                {videoDetail?.recorded_at ? (hydrated ? new Date(videoDetail.recorded_at).toLocaleString() : formatDateString(videoDetail.recorded_at)) : '-'}
              </span>
              <button
                onClick={() => setTimestampNow('recorded_at')}
                disabled={savingExecution}
                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
              >
                Set Now
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Edited At</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>
                {videoDetail?.edited_at ? (hydrated ? new Date(videoDetail.edited_at).toLocaleString() : formatDateString(videoDetail.edited_at)) : '-'}
              </span>
              <button
                onClick={() => setTimestampNow('edited_at')}
                disabled={savingExecution}
                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
              >
                Set Now
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Ready to Post At</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>
                {videoDetail?.ready_to_post_at ? (hydrated ? new Date(videoDetail.ready_to_post_at).toLocaleString() : formatDateString(videoDetail.ready_to_post_at)) : '-'}
              </span>
              <button
                onClick={() => setTimestampNow('ready_to_post_at')}
                disabled={savingExecution}
                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
              >
                Set Now
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Posted At</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>
                {videoDetail?.posted_at ? (hydrated ? new Date(videoDetail.posted_at).toLocaleString() : formatDateString(videoDetail.posted_at)) : '-'}
              </span>
              <button
                onClick={() => setTimestampNow('posted_at')}
                disabled={savingExecution}
                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
              >
                Set Now
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Rejected At</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>
                {videoDetail?.rejected_at ? (hydrated ? new Date(videoDetail.rejected_at).toLocaleString() : formatDateString(videoDetail.rejected_at)) : '-'}
              </span>
              <button
                onClick={() => setTimestampNow('rejected_at')}
                disabled={savingExecution}
                style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
              >
                Set Now
              </button>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>
              Recording Notes
              {executionForm.recording_status === 'REJECTED' && <span style={{ color: '#dc3545', marginLeft: '4px' }}>*</span>}
            </label>
            <textarea
              value={executionForm.recording_notes}
              onChange={(e) => setExecutionForm(prev => ({ ...prev, recording_notes: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px',
                border: executionForm.recording_status === 'REJECTED' && !executionForm.recording_notes.trim() && !executionForm.editor_notes.trim() && !executionForm.uploader_notes.trim()
                  ? '2px solid #dc3545'
                  : '1px solid #ccc',
                borderRadius: '4px',
                minHeight: '60px',
                resize: 'vertical',
              }}
              placeholder="Notes from recording..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>
              Editor Notes
              {executionForm.recording_status === 'REJECTED' && <span style={{ color: '#dc3545', marginLeft: '4px' }}>*</span>}
            </label>
            <textarea
              value={executionForm.editor_notes}
              onChange={(e) => setExecutionForm(prev => ({ ...prev, editor_notes: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px',
                border: executionForm.recording_status === 'REJECTED' && !executionForm.recording_notes.trim() && !executionForm.editor_notes.trim() && !executionForm.uploader_notes.trim()
                  ? '2px solid #dc3545'
                  : '1px solid #ccc',
                borderRadius: '4px',
                minHeight: '60px',
                resize: 'vertical',
              }}
              placeholder="Notes from editing..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>
              Uploader Notes
              {executionForm.recording_status === 'REJECTED' && <span style={{ color: '#dc3545', marginLeft: '4px' }}>*</span>}
            </label>
            <textarea
              value={executionForm.uploader_notes}
              onChange={(e) => setExecutionForm(prev => ({ ...prev, uploader_notes: e.target.value }))}
              style={{
                width: '100%',
                padding: '8px',
                border: executionForm.recording_status === 'REJECTED' && !executionForm.recording_notes.trim() && !executionForm.editor_notes.trim() && !executionForm.uploader_notes.trim()
                  ? '2px solid #dc3545'
                  : '1px solid #ccc',
                borderRadius: '4px',
                minHeight: '60px',
                resize: 'vertical',
              }}
              placeholder="Notes from uploading..."
            />
          </div>
        </div>

        {/* Posting Fields */}
        <div style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: executionForm.recording_status === 'POSTED' ? '#f0f7ff' : '#fff',
          border: executionForm.recording_status === 'POSTED' ? '2px solid #0066cc' : '1px solid #ddd',
          borderRadius: '4px',
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '14px' }}>
            Posting Details
            {executionForm.recording_status === 'POSTED' && <span style={{ color: '#0066cc', marginLeft: '8px', fontSize: '12px' }}>(Required for POSTED)</span>}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
                Platform
                {executionForm.recording_status === 'POSTED' && <span style={{ color: '#dc3545', marginLeft: '4px' }}>*</span>}
              </label>
              <select
                value={executionForm.posted_platform}
                onChange={(e) => setExecutionForm(prev => ({ ...prev, posted_platform: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: executionForm.recording_status === 'POSTED' && !executionForm.posted_platform
                    ? '2px solid #dc3545'
                    : '1px solid #ccc',
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
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
                Posted URL
                {executionForm.recording_status === 'POSTED' && <span style={{ color: '#dc3545', marginLeft: '4px' }}>*</span>}
              </label>
              <input
                type="text"
                value={executionForm.posted_url}
                onChange={(e) => setExecutionForm(prev => ({ ...prev, posted_url: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: executionForm.recording_status === 'POSTED' && !executionForm.posted_url.trim()
                    ? '2px solid #dc3545'
                    : '1px solid #ccc',
                  borderRadius: '4px',
                }}
                placeholder="https://..."
              />
              {videoDetail?.posted_url && videoDetail.recording_status === 'POSTED' && (
                <a
                  href={videoDetail.posted_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '12px', color: '#0066cc', display: 'block', marginTop: '5px' }}
                >
                  Open posted video &rarr;
                </a>
              )}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>Account/Handle</label>
              <input
                type="text"
                value={executionForm.posted_account}
                onChange={(e) => setExecutionForm(prev => ({ ...prev, posted_account: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder="@username"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>Posted At (Local)</label>
              <input
                type="text"
                value={executionForm.posted_at_local}
                onChange={(e) => setExecutionForm(prev => ({ ...prev, posted_at_local: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder="e.g., 3pm EST"
              />
            </div>
          </div>
          <div style={{ marginTop: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>Posting Error (if failed)</label>
            <textarea
              value={executionForm.posting_error}
              onChange={(e) => setExecutionForm(prev => ({ ...prev, posting_error: e.target.value }))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '40px', resize: 'vertical' }}
              placeholder="Error message if posting failed..."
            />
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={saveExecution}
          disabled={savingExecution}
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: savingExecution ? 'not-allowed' : 'pointer',
            fontSize: '14px',
          }}
        >
          {savingExecution ? 'Saving...' : 'Save Execution Status'}
        </button>
      </section>

      {/* Events / Audit Log */}
      <section style={{ ...sectionStyle, borderColor: '#6c757d' }}>
        <h2 style={{ marginTop: 0 }}>Events / Audit Log ({events.length})</h2>
        {events.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Actor</th>
                <th style={thStyle}>Transition</th>
                <th style={thStyle}>Correlation ID</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td style={tdStyle} title={formatDateString(event.created_at)}>{displayTime(event.created_at)}</td>
                  <td style={tdStyle}>{event.event_type}</td>
                  <td style={tdStyle}>{event.actor}</td>
                  <td style={tdStyle}>
                    {event.from_status || '-'} &rarr; {event.to_status || '-'}
                  </td>
                  <td
                    style={copyableCellStyle}
                    onClick={() => copyToClipboard(event.correlation_id, `corr-${event.id}`)}
                    title="Click to copy"
                  >
                    {event.correlation_id.slice(0, 16)}...
                    {copiedId === `corr-${event.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>No events found for this video</p>
        )}
      </section>

      {/* Timeline Panel (Admin Only) */}
      {timelineItems.length > 0 && (
        <section style={{ ...sectionStyle, borderColor: '#6610f2' }}>
          <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>Timeline</span>
            <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
              ({timelineItems.length} items)
            </span>
            <button
              onClick={fetchTimeline}
              disabled={timelineLoading}
              style={{
                marginLeft: 'auto',
                padding: '4px 10px',
                fontSize: '12px',
                backgroundColor: '#6610f2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: timelineLoading ? 'not-allowed' : 'pointer',
                opacity: timelineLoading ? 0.7 : 1,
              }}
            >
              {timelineLoading ? 'Loading...' : 'Refresh'}
            </button>
          </h2>
          {timelineError && (
            <div style={{ color: 'red', marginBottom: '10px', fontSize: '13px' }}>
              Error: {timelineError}
            </div>
          )}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {timelineItems.map((item, idx) => {
              const typeColors: Record<string, { bg: string; border: string; text: string }> = {
                event: { bg: '#e7f5ff', border: '#74c0fc', text: '#1971c2' },
                assignment: { bg: '#d3f9d8', border: '#69db7c', text: '#2f9e44' },
                video_snapshot: { bg: '#fff3bf', border: '#ffd43b', text: '#e67700' },
                email_sent: { bg: '#d0f0fd', border: '#38bdf8', text: '#0369a1' },
                email_skipped: { bg: '#fef3c7', border: '#fcd34d', text: '#b45309' },
                email_failed: { bg: '#fee2e2', border: '#fca5a5', text: '#dc2626' },
                slack_sent: { bg: '#c6f6d5', border: '#68d391', text: '#22543d' },
                slack_skipped: { bg: '#e9d8fd', border: '#b794f4', text: '#553c9a' },
                slack_failed: { bg: '#fed7d7', border: '#fc8181', text: '#c53030' },
                admin_action: { bg: '#fce7f3', border: '#f9a8d4', text: '#be185d' },
              };
              // Determine display type for styling based on event_type metadata
              const eventType = (item.metadata?.event_type as string) || '';
              let displayType: string = item.type;
              if (eventType.startsWith('email_sent')) {
                displayType = 'email_sent';
              } else if (eventType.startsWith('email_skipped') || eventType === 'email_skipped_no_config' || eventType === 'email_skipped_no_recipient' || eventType === 'email_skipped_disabled') {
                displayType = 'email_skipped';
              } else if (eventType === 'email_failed') {
                displayType = 'email_failed';
              } else if (eventType === 'slack_sent') {
                displayType = 'slack_sent';
              } else if (eventType.startsWith('slack_skipped') || eventType === 'slack_skipped_no_config' || eventType === 'slack_skipped_disabled') {
                displayType = 'slack_skipped';
              } else if (eventType === 'slack_failed') {
                displayType = 'slack_failed';
              } else if (eventType.startsWith('admin_')) {
                displayType = 'admin_action';
              }
              const colors = typeColors[displayType] || typeColors[item.type] || typeColors.event;
              return (
                <div
                  key={`${item.ts}-${idx}`}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '10px 12px',
                    borderBottom: '1px solid #e9ecef',
                    backgroundColor: idx % 2 === 0 ? '#fafafa' : '#fff',
                  }}
                >
                  <div style={{ minWidth: '140px', fontSize: '12px', color: '#666' }} title={item.ts}>
                    {hydrated ? new Date(item.ts).toLocaleString() : formatDateString(item.ts)}
                  </div>
                  <div style={{ minWidth: '90px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                        fontSize: '11px',
                        fontWeight: 500,
                      }}
                    >
                      {displayType === 'email_sent' ? 'email' :
                       displayType === 'email_skipped' ? 'email' :
                       displayType === 'email_failed' ? 'email' :
                       displayType === 'slack_sent' ? 'slack' :
                       displayType === 'slack_skipped' ? 'slack' :
                       displayType === 'slack_failed' ? 'slack' :
                       displayType === 'admin_action' ? 'admin' :
                       item.type}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '2px' }}>
                      {item.label}
                    </div>
                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <details style={{ marginTop: '4px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '11px', color: '#1971c2' }}>
                          Details
                        </summary>
                        <pre style={{
                          marginTop: '4px',
                          padding: '6px',
                          backgroundColor: '#f1f3f4',
                          borderRadius: '4px',
                          fontSize: '10px',
                          overflow: 'auto',
                          maxHeight: '100px',
                        }}>
                          {JSON.stringify(item.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
