'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';

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

interface QueueVideo {
  id: string;
  variant_id: string;
  account_id: string;
  status: string;
  google_drive_url: string;
  created_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  recording_status: string | null;
  last_status_changed_at: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  script_locked_text: string | null;
  script_locked_version: number | null;
}

const RECORDING_STATUS_TABS = ['ALL', 'NOT_RECORDED', 'RECORDED', 'EDITED', 'READY_TO_POST', 'POSTED', 'REJECTED'] as const;

// Status badge color helper (matches detail page)
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

// Admin identifier - in a real app this would come from auth
const ADMIN_IDENTIFIER = 'admin';

export default function AdminPipelinePage() {
  const hydrated = useHydrated();
  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  const [claimedVideos, setClaimedVideos] = useState<ClaimedVideo[]>([]);
  const [recentEvents, setRecentEvents] = useState<VideoEvent[]>([]);
  const [queueVideos, setQueueVideos] = useState<QueueVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);
  const [videoIdFilter, setVideoIdFilter] = useState('');
  const [claimedByFilter, setClaimedByFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Recording status tab state
  const [activeRecordingTab, setActiveRecordingTab] = useState<typeof RECORDING_STATUS_TABS[number]>('ALL');
  const [claimedFilter, setClaimedFilter] = useState<'any' | 'unclaimed' | 'claimed'>('any');

  // Per-row claim/release state
  const [claimingVideoId, setClaimingVideoId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<{ videoId: string; message: string } | null>(null);

  const checkAdminEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enabled');
      const data = await res.json();
      setAdminEnabled(data.enabled === true);
    } catch {
      setAdminEnabled(false);
    }
  }, []);

  const fetchQueueVideos = useCallback(async () => {
    setQueueLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeRecordingTab !== 'ALL') {
        params.set('recording_status', activeRecordingTab);
      }
      params.set('claimed', claimedFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/videos/queue?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setQueueVideos(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch queue videos:', err);
    } finally {
      setQueueLoading(false);
    }
  }, [activeRecordingTab, claimedFilter]);

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
        fetchQueueVideos();
      } else {
        setReleaseMessage(`Error: ${data.message || 'Failed to release'}`);
      }
    } catch (err) {
      setReleaseMessage('Error: Failed to release stale claims');
    } finally {
      setReleasing(false);
    }
  }, [fetchData, fetchQueueVideos]);

  // Claim a video
  const claimVideo = async (videoId: string) => {
    setClaimingVideoId(videoId);
    setClaimError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimed_by: ADMIN_IDENTIFIER }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchQueueVideos();
        fetchData();
      } else if (data.code === 'ALREADY_CLAIMED') {
        setClaimError({
          videoId,
          message: `Already claimed by ${data.details?.claimed_by || 'someone else'}`,
        });
        // Refresh to show current state
        fetchQueueVideos();
      } else {
        setClaimError({ videoId, message: data.error || 'Failed to claim' });
      }
    } catch (err) {
      setClaimError({ videoId, message: 'Network error' });
    } finally {
      setClaimingVideoId(null);
    }
  };

  // Release a video
  const releaseVideo = async (videoId: string) => {
    setClaimingVideoId(videoId);
    setClaimError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimed_by: ADMIN_IDENTIFIER }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchQueueVideos();
        fetchData();
      } else {
        setClaimError({ videoId, message: data.error || 'Failed to release' });
      }
    } catch (err) {
      setClaimError({ videoId, message: 'Network error' });
    } finally {
      setClaimingVideoId(null);
    }
  };

  useEffect(() => {
    checkAdminEnabled();
  }, [checkAdminEnabled]);

  useEffect(() => {
    if (adminEnabled === true) {
      fetchData();
      fetchQueueVideos();
      const interval = setInterval(() => {
        fetchData();
        fetchQueueVideos();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [adminEnabled, fetchData, fetchQueueVideos]);

  // Refetch queue when tab or claimed filter changes
  useEffect(() => {
    if (adminEnabled === true) {
      fetchQueueVideos();
    }
  }, [activeRecordingTab, claimedFilter, adminEnabled, fetchQueueVideos]);

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

  // Use hydration-safe time display
  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
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

  // Check if a video is claimed by current admin
  const isClaimedByMe = (video: QueueVideo) => video.claimed_by === ADMIN_IDENTIFIER;

  // Check if a video is claimed by someone else (and not expired)
  const isClaimedByOther = (video: QueueVideo) => {
    if (!video.claimed_by || video.claimed_by === ADMIN_IDENTIFIER) return false;
    if (!video.claim_expires_at) return true;
    return new Date(video.claim_expires_at) > new Date();
  };

  // Check if video is unclaimed
  const isUnclaimed = (video: QueueVideo) => {
    if (!video.claimed_by) return true;
    if (!video.claim_expires_at) return false;
    return new Date(video.claim_expires_at) <= new Date();
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Admin: Video Pipeline</h1>
        <div>
          <button onClick={() => { fetchData(); fetchQueueVideos(); }} style={{ padding: '8px 16px', marginRight: '10px' }}>
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
              Last updated: {hydrated ? lastRefresh.toLocaleString() : formatDateString(lastRefresh.toISOString())}
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
      <section style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
        <h2 style={{ marginTop: 0 }}>Queue Summary</h2>
        {queueSummary ? (
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: '18px' }}>
              <strong>Total Queued:</strong> {queueSummary.total_queued}
            </div>
            {Object.entries(queueSummary.counts_by_status).map(([status, count]) => (
              <div key={status} style={{ padding: '4px 10px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '14px' }}>
                {status.replace(/_/g, ' ')}: <strong>{count}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p>No data available</p>
        )}
      </section>

      {/* Video Queue with Recording Status Tabs */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Video Queue</h2>

        {/* Recording Status Tabs */}
        <div style={{ marginBottom: '15px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {RECORDING_STATUS_TABS.map(tab => {
            const colors = tab === 'ALL' ? { bg: '#f8f9fa', badge: '#495057' } : getStatusBadgeColor(tab);
            const isActive = activeRecordingTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveRecordingTab(tab)}
                style={{
                  padding: '8px 16px',
                  border: isActive ? `2px solid ${colors.badge}` : '1px solid #dee2e6',
                  borderRadius: '4px',
                  backgroundColor: isActive ? colors.badge : '#fff',
                  color: isActive ? '#fff' : colors.badge,
                  cursor: 'pointer',
                  fontWeight: isActive ? 'bold' : 'normal',
                  fontSize: '13px',
                }}
              >
                {tab.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>

        {/* Claimed filter */}
        <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Claim Status:</span>
          {(['any', 'unclaimed', 'claimed'] as const).map(filter => (
            <label key={filter} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="claimedFilter"
                checked={claimedFilter === filter}
                onChange={() => setClaimedFilter(filter)}
              />
              <span style={{ fontSize: '14px' }}>{filter.charAt(0).toUpperCase() + filter.slice(1)}</span>
            </label>
          ))}
          {queueLoading && <span style={{ color: '#666', fontSize: '12px', marginLeft: '10px' }}>Loading...</span>}
        </div>

        {/* Queue Table */}
        {queueVideos.length > 0 ? (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Video ID</th>
                <th style={thStyle}>Recording Status</th>
                <th style={thStyle}>Last Changed</th>
                <th style={thStyle}>Script</th>
                <th style={thStyle}>Claim Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queueVideos.map((video) => {
                const statusColors = getStatusBadgeColor(video.recording_status);
                const claimedByOther = isClaimedByOther(video);
                const claimedByMe = isClaimedByMe(video);
                const unclaimed = isUnclaimed(video);
                const isProcessing = claimingVideoId === video.id;
                const hasError = claimError?.videoId === video.id;

                return (
                  <tr key={video.id} style={{ backgroundColor: claimedByMe ? '#e8f5e9' : claimedByOther ? '#fff3e0' : 'transparent' }}>
                    <td style={copyableCellStyle}>
                      <Link href={`/admin/pipeline/${video.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                        {video.id.slice(0, 8)}...
                      </Link>
                      <span
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(video.id, `q-${video.id}`); }}
                        style={{ marginLeft: '5px', cursor: 'pointer', color: '#666' }}
                        title="Copy full ID"
                      >
                        [copy]
                      </span>
                      {copiedId === `q-${video.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        backgroundColor: statusColors.badge,
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 'bold',
                      }}>
                        {(video.recording_status || 'NOT_RECORDED').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {video.last_status_changed_at ? (
                        <span title={formatDateString(video.last_status_changed_at)}>
                          {displayTime(video.last_status_changed_at)}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={tdStyle}>
                      {video.script_locked_version ? (
                        <span style={{ padding: '2px 6px', backgroundColor: '#d4edda', borderRadius: '4px', fontSize: '11px' }}>
                          v{video.script_locked_version} locked
                        </span>
                      ) : video.script_locked_text ? (
                        <span style={{ padding: '2px 6px', backgroundColor: '#d4edda', borderRadius: '4px', fontSize: '11px' }}>
                          Locked
                        </span>
                      ) : (
                        <span style={{ color: '#999', fontSize: '12px' }}>No script</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {unclaimed ? (
                        <span style={{ color: '#28a745', fontSize: '12px' }}>Unclaimed</span>
                      ) : claimedByMe ? (
                        <span style={{ color: '#0066cc', fontSize: '12px', fontWeight: 'bold' }}>Claimed by you</span>
                      ) : (
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ color: '#dc3545' }}>Claimed by {video.claimed_by}</span>
                          {video.claim_expires_at && (
                            <div style={{ color: '#666', fontSize: '11px' }} title={formatDateString(video.claim_expires_at)}>
                              Expires: {displayTime(video.claim_expires_at)}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {unclaimed && (
                          <button
                            onClick={() => claimVideo(video.id)}
                            disabled={isProcessing}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            {isProcessing ? '...' : 'Claim'}
                          </button>
                        )}
                        {claimedByMe && (
                          <button
                            onClick={() => releaseVideo(video.id)}
                            disabled={isProcessing}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            {isProcessing ? '...' : 'Release'}
                          </button>
                        )}
                        {claimedByOther && (
                          <span style={{ color: '#999', fontSize: '11px', fontStyle: 'italic' }}>Locked</span>
                        )}
                        <Link
                          href={`/admin/pipeline/${video.id}`}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            textDecoration: 'none',
                            fontSize: '12px',
                          }}
                        >
                          Details
                        </Link>
                        {hasError && (
                          <span style={{ color: '#dc3545', fontSize: '11px' }}>{claimError?.message}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>
            {queueLoading ? 'Loading...' : 'No videos in queue for this filter'}
          </p>
        )}
        <div style={{ fontSize: '12px', color: '#666' }}>
          Showing {queueVideos.length} video(s) with recording_status = {activeRecordingTab === 'ALL' ? 'any' : activeRecordingTab}
        </div>
      </section>

      {/* Filters for legacy sections */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Filters:</span>
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

      {/* Claimed Videos */}
      <section style={{ marginBottom: '40px' }}>
        <h2>Currently Claimed ({filteredClaimedVideos.length}{hasActiveFilters ? ` of ${claimedVideos.length}` : ''})</h2>
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
                    <Link href={`/admin/pipeline/${video.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
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
                  <td style={tdStyle} title={formatDateString(video.claimed_at)}>{displayTime(video.claimed_at)}</td>
                  <td style={tdStyle} title={video.claim_expires_at ? formatDateString(video.claim_expires_at) : ''}>{video.claim_expires_at ? displayTime(video.claim_expires_at) : '-'}</td>
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
                  <td style={tdStyle} title={formatDateString(event.created_at)}>{displayTime(event.created_at)}</td>
                  <td style={tdStyle}>{event.event_type}</td>
                  <td style={copyableCellStyle}>
                    <Link href={`/admin/pipeline/${event.video_id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
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
