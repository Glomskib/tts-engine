'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface QueueSummary {
  counts_by_status: Record<string, number>;
  total_queued: number;
}

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
  const [videoIdFilter, setVideoIdFilter] = useState('');
  const [claimedByFilter, setClaimedByFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
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
  const inputStyle = { padding: '6px 10px', marginRight: '10px', border: '1px solid #ccc', borderRadius: '4px' };
  const selectStyle = { padding: '6px 10px', marginRight: '10px', border: '1px solid #ccc', borderRadius: '4px' };

  // Get distinct event types for dropdown
  const eventTypes = Array.from(new Set(recentEvents.map(e => e.event_type))).sort();

  // Apply filters
  const filteredClaimedVideos = claimedVideos.filter(video => {
    const matchesVideoId = !videoIdFilter || video.id.toLowerCase().includes(videoIdFilter.toLowerCase());
    const matchesClaimedBy = !claimedByFilter || video.claimed_by.toLowerCase().includes(claimedByFilter.toLowerCase());
    return matchesVideoId && matchesClaimedBy;
  });

  const filteredEvents = recentEvents.filter(event => {
    const matchesVideoId = !videoIdFilter || event.video_id.toLowerCase().includes(videoIdFilter.toLowerCase());
    const matchesEventType = !eventTypeFilter || event.event_type === eventTypeFilter;
    const matchesActor = !claimedByFilter || event.actor.toLowerCase().includes(claimedByFilter.toLowerCase());
    return matchesVideoId && matchesEventType && matchesActor;
  });

  const hasActiveFilters = videoIdFilter || claimedByFilter || eventTypeFilter;

  const clearFilters = () => {
    setVideoIdFilter('');
    setClaimedByFilter('');
    setEventTypeFilter('');
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(label);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyableCellStyle = {
    ...tdStyle,
    fontFamily: 'monospace',
    fontSize: '12px',
    cursor: 'pointer',
    position: 'relative' as const,
  };

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

      {/* Filters */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <input
            type="text"
            placeholder="Filter by Video ID..."
            value={videoIdFilter}
            onChange={(e) => setVideoIdFilter(e.target.value)}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Filter by Claimed By / Actor..."
            value={claimedByFilter}
            onChange={(e) => setClaimedByFilter(e.target.value)}
            style={inputStyle}
          />
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">All Event Types</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

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
        <h2>Claimed Videos ({filteredClaimedVideos.length}{hasActiveFilters ? ` of ${claimedVideos.length}` : ''})</h2>
        {filteredClaimedVideos.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Claimed By</th>
                <th style={thStyle}>Claimed</th>
                <th style={thStyle}>Expires</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaimedVideos.map((video) => (
                <tr key={video.id}>
                  <td style={copyableCellStyle}>
                    <Link href={`/admin/pipeline/video/${video.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                      {video.id.slice(0, 8)}...
                    </Link>
                    <span
                      onClick={(e) => { e.stopPropagation(); copyToClipboard(video.id, `vid-${video.id}`); }}
                      style={{ marginLeft: '5px', cursor: 'pointer', color: '#666' }}
                      title="Copy full ID"
                    >
                      [copy]
                    </span>
                    {copiedId === `vid-${video.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                  </td>
                  <td style={tdStyle}>{video.claimed_by}</td>
                  <td style={tdStyle} title={formatDate(video.claimed_at)}>{timeAgo(video.claimed_at)}</td>
                  <td style={tdStyle} title={video.claim_expires_at ? formatDate(video.claim_expires_at) : ''}>{video.claim_expires_at ? timeAgo(video.claim_expires_at) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>{hasActiveFilters ? 'No matching claimed videos' : 'No videos currently claimed'}</p>
        )}
      </section>

      {/* Recent Events */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Recent Events ({filteredEvents.length}{hasActiveFilters ? ` of ${recentEvents.length}` : ''})</h2>
        {filteredEvents.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Video ID</th>
                <th style={thStyle}>Actor</th>
                <th style={thStyle}>Transition</th>
                <th style={thStyle}>Correlation</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td style={tdStyle} title={formatDate(event.created_at)}>{timeAgo(event.created_at)}</td>
                  <td style={tdStyle}>{event.event_type}</td>
                  <td style={copyableCellStyle}>
                    <Link href={`/admin/pipeline/video/${event.video_id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                      {event.video_id.slice(0, 8)}...
                    </Link>
                    <span
                      onClick={(e) => { e.stopPropagation(); copyToClipboard(event.video_id, `evt-vid-${event.id}`); }}
                      style={{ marginLeft: '5px', cursor: 'pointer', color: '#666' }}
                      title="Copy full ID"
                    >
                      [copy]
                    </span>
                    {copiedId === `evt-vid-${event.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                  </td>
                  <td style={tdStyle}>{event.actor}</td>
                  <td style={tdStyle}>
                    {event.from_status || '-'} → {event.to_status || '-'}
                  </td>
                  <td
                    style={copyableCellStyle}
                    onClick={() => copyToClipboard(event.correlation_id, `corr-${event.id}`)}
                    title="Click to copy"
                  >
                    {event.correlation_id.slice(0, 12)}...
                    {copiedId === `corr-${event.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>{hasActiveFilters ? 'No matching events' : 'No recent events'}</p>
        )}
      </section>

      <div style={{ color: '#999', fontSize: '12px' }}>
        Auto-refreshes every 10 seconds
      </div>
    </div>
  );
}
