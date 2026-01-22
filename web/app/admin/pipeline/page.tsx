'use client';

import { useState, useEffect, useCallback } from 'react';

interface QueueSummary {
  counts_by_status: Record<string, number>;
  total_queued: number;
}

interface ClaimedVideo {
  id: string;
  claimed_by: string;
  claimed_at: string;
  updated_at: string;
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

export default function AdminPipelinePage() {
  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  const [claimedVideos, setClaimedVideos] = useState<ClaimedVideo[]>([]);
  const [recentEvents, setRecentEvents] = useState<VideoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
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
    try {
      const [summaryRes, claimedRes, eventsRes] = await Promise.all([
        fetch('/api/observability/queue-summary'),
        fetch('/api/observability/claimed'),
        fetch('/api/observability/recent-events'),
      ]);

      const [summaryData, claimedData, eventsData] = await Promise.all([
        summaryRes.json(),
        claimedRes.json(),
        eventsRes.json(),
      ]);

      if (summaryData.ok) setQueueSummary(summaryData.data);
      if (claimedData.ok) setClaimedVideos(claimedData.data || []);
      if (eventsData.ok) setRecentEvents(eventsData.data || []);

      setLastRefresh(new Date());
      setError('');
    } catch (err) {
      setError('Failed to fetch observability data');
    } finally {
      setLoading(false);
    }
  }, []);

  const releaseStale = useCallback(async () => {
    setReleasing(true);
    setReleaseMessage(null);
    try {
      const res = await fetch('/api/videos/release-stale', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setReleaseMessage(`Released ${data.released_count} stale claim(s)`);
        fetchData();
      } else {
        setReleaseMessage(`Error: ${data.message || 'Failed to release'}`);
      }
    } catch (err) {
      setReleaseMessage('Error: Failed to release stale claims');
    } finally {
      setReleasing(false);
    }
  }, [fetchData]);

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchData();
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [adminEnabled, fetchData]);

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
    return <div style={{ padding: '20px' }}>Loading observability data...</div>;
  }

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

  const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '20px' };
  const thStyle = { border: '1px solid #ccc', padding: '8px', textAlign: 'left' as const, backgroundColor: '#f5f5f5' };
  const tdStyle = { border: '1px solid #ccc', padding: '8px' };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Admin: Video Pipeline Observability</h1>
        <div>
          <button onClick={fetchData} style={{ padding: '8px 16px', marginRight: '10px' }}>
            Refresh
          </button>
          <button
            onClick={releaseStale}
            disabled={releasing}
            style={{ padding: '8px 16px', marginRight: '10px', backgroundColor: '#f0ad4e', border: '1px solid #eea236' }}
          >
            {releasing ? 'Releasing...' : 'Release stale claims'}
          </button>
          {lastRefresh && (
            <span style={{ color: '#666', fontSize: '14px' }}>
              Last updated: {formatDate(lastRefresh.toISOString())}
            </span>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</div>}
      {releaseMessage && (
        <div style={{ color: releaseMessage.startsWith('Error') ? 'red' : 'green', marginBottom: '20px' }}>
          {releaseMessage}
        </div>
      )}

      {/* Queue Summary */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Queue Summary</h2>
        {queueSummary ? (
          <div>
            <p style={{ fontSize: '18px', marginBottom: '10px' }}>
              <strong>Total Queued:</strong> {queueSummary.total_queued}
            </p>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(queueSummary.counts_by_status).map(([status, count]) => (
                  <tr key={status}>
                    <td style={tdStyle}>{status.replace(/_/g, ' ').toUpperCase()}</td>
                    <td style={tdStyle}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No data available</p>
        )}
      </section>

      {/* Claimed Videos */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Claimed Videos ({claimedVideos.length})</h2>
        {claimedVideos.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Claimed By</th>
                <th style={thStyle}>Claimed</th>
                <th style={thStyle}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {claimedVideos.map((video) => (
                <tr key={video.id}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{video.id}</td>
                  <td style={tdStyle}>{video.claimed_by}</td>
                  <td style={tdStyle} title={formatDate(video.claimed_at)}>{timeAgo(video.claimed_at)}</td>
                  <td style={tdStyle} title={formatDate(video.updated_at)}>{timeAgo(video.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>No videos currently claimed</p>
        )}
      </section>

      {/* Recent Events */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Recent Events ({recentEvents.length})</h2>
        {recentEvents.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Video ID</th>
                <th style={thStyle}>Actor</th>
                <th style={thStyle}>Transition</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((event) => (
                <tr key={event.id}>
                  <td style={tdStyle} title={formatDate(event.created_at)}>{timeAgo(event.created_at)}</td>
                  <td style={tdStyle}>{event.event_type}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>{event.video_id}</td>
                  <td style={tdStyle}>{event.actor}</td>
                  <td style={tdStyle}>
                    {event.from_status || '-'} → {event.to_status || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>No recent events</p>
        )}
      </section>

      <div style={{ color: '#999', fontSize: '12px' }}>
        Auto-refreshes every 10 seconds
      </div>
    </div>
  );
}
