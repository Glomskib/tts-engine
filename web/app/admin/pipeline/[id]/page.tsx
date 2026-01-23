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
        fetch('/api/observability/recent-events?limit=100'),
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

      // Filter events for this video
      if (eventsData.ok && eventsData.data) {
        const videoEvents = eventsData.data.filter((e: VideoEvent) => e.video_id === videoId);
        setEvents(videoEvents);
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

  const saveExecution = async () => {
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
        payload.force = !executionForm.posted_url || !executionForm.posted_platform; // Force if missing required fields
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
    }
  }, [adminEnabled, fetchData]);

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
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Recording Notes</label>
            <textarea
              value={executionForm.recording_notes}
              onChange={(e) => setExecutionForm(prev => ({ ...prev, recording_notes: e.target.value }))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '60px', resize: 'vertical' }}
              placeholder="Notes from recording..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Editor Notes</label>
            <textarea
              value={executionForm.editor_notes}
              onChange={(e) => setExecutionForm(prev => ({ ...prev, editor_notes: e.target.value }))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '60px', resize: 'vertical' }}
              placeholder="Notes from editing..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Uploader Notes</label>
            <textarea
              value={executionForm.uploader_notes}
              onChange={(e) => setExecutionForm(prev => ({ ...prev, uploader_notes: e.target.value }))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '60px', resize: 'vertical' }}
              placeholder="Notes from uploading..."
            />
          </div>
        </div>

        {/* Posting Fields */}
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '4px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '14px' }}>Posting Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>Platform</label>
              <select
                value={executionForm.posted_platform}
                onChange={(e) => setExecutionForm(prev => ({ ...prev, posted_platform: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              >
                <option value="">-- Select --</option>
                {PLATFORMS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>Posted URL</label>
              <input
                type="text"
                value={executionForm.posted_url}
                onChange={(e) => setExecutionForm(prev => ({ ...prev, posted_url: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
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

      {/* Event Timeline */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Event Timeline ({events.length})</h2>
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
    </div>
  );
}
