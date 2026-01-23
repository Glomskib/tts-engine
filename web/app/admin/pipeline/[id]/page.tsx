'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params.id as string;

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

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const timeAgo = (dateStr: string) => {
    try {
      const now = new Date();
      const date = new Date(dateStr);
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return dateStr;
    }
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
                  <td title={formatDate(claimedInfo.claimed_at)}>{timeAgo(claimedInfo.claimed_at)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 20px 5px 0', fontWeight: 'bold' }}>Expires:</td>
                  <td title={formatDate(claimedInfo.claim_expires_at)}>{timeAgo(claimedInfo.claim_expires_at)}</td>
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
                  <td style={tdStyle} title={formatDate(event.created_at)}>{timeAgo(event.created_at)}</td>
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
