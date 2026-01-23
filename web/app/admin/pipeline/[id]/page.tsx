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

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params.id as string;

  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [claimedInfo, setClaimedInfo] = useState<ClaimedVideo | null>(null);
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);

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
      const [claimedRes, eventsRes] = await Promise.all([
        fetch('/api/observability/claimed'),
        fetch('/api/observability/recent-events?limit=100'),
      ]);

      const [claimedData, eventsData] = await Promise.all([
        claimedRes.json(),
        eventsRes.json(),
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

      setError('');
    } catch (err) {
      setError('Failed to fetch video data');
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchData();
    }
  }, [adminEnabled, fetchData]);

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
        <div style={{ display: 'flex', gap: '10px' }}>
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
          <span style={{ color: '#666', fontSize: '14px', alignSelf: 'center' }}>
            {claimedInfo ? `Currently claimed by ${claimedInfo.claimed_by}` : 'No active claim to release'}
          </span>
        </div>
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
