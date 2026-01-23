'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface VideoEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  correlation_id: string;
  actor: string;
  request_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params.id as string;

  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const checkAdminEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enabled');
      const data = await res.json();
      setAdminEnabled(data.enabled === true);
    } catch {
      setAdminEnabled(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!videoId) return;
    try {
      const res = await fetch(`/api/videos/${videoId}/events`);
      const data = await res.json();
      if (data.ok) {
        setEvents(data.data || []);
      } else {
        setError(data.message || 'Failed to fetch events');
      }
    } catch (err) {
      setError('Failed to fetch video events');
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchEvents();
    }
  }, [adminEnabled, fetchEvents]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(label);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
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

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => router.push('/admin/pipeline')}
          style={{ padding: '8px 16px', marginRight: '10px' }}
        >
          &larr; Back to Pipeline
        </button>
        <button onClick={fetchEvents} style={{ padding: '8px 16px' }}>
          Refresh
        </button>
      </div>

      <h1>Video Details</h1>

      {error && <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>}

      {/* Video ID */}
      <section style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
        <h2 style={{ marginTop: 0 }}>Video ID</h2>
        <div
          style={{ fontFamily: 'monospace', fontSize: '16px', cursor: 'pointer', padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #ddd' }}
          onClick={() => copyToClipboard(videoId, 'video-id')}
          title="Click to copy"
        >
          {videoId}
          {copiedId === 'video-id' && <span style={{ marginLeft: '10px', color: 'green', fontSize: '12px' }}>Copied!</span>}
        </div>
      </section>

      {/* Event History */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Event History ({events.length})</h2>
        {events.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Actor</th>
                <th style={thStyle}>Transition</th>
                <th style={thStyle}>Correlation ID</th>
                <th style={thStyle}>Details</th>
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
                  <td style={{ ...tdStyle, fontSize: '11px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {Object.keys(event.details).length > 0 ? (
                      <details>
                        <summary style={{ cursor: 'pointer' }}>View details</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '10px', margin: '5px 0 0 0' }}>
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span style={{ color: '#999' }}>-</span>
                    )}
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
