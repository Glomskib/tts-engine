'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import { EmptyState } from '../components/AdminPageLayout';

interface QueueVideo {
  id: string;
  variant_id: string | null;
  account_id: string | null;
  status: string | null;
  recording_status: string;
  last_status_changed_at: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  script_locked_text: string | null;
  script_locked_version: number | null;
}

const RECORDING_STATUSES = ['', 'NOT_RECORDED', 'RECORDED', 'EDITED', 'READY_TO_POST', 'POSTED', 'REJECTED'] as const;

export default function ExecutionDashboardPage() {
  const hydrated = useHydrated();
  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [videos, setVideos] = useState<QueueVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
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
    setLoading(true);
    try {
      let url = '/api/videos/queue?limit=100&claimed=any';
      if (statusFilter) {
        url += `&recording_status=${statusFilter}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok) {
        setVideos(data.data || []);
        setError('');
      } else {
        setError(data.error || 'Failed to fetch videos');
      }
    } catch {
      setError('Failed to fetch videos');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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

  const displayTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
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

  const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '20px' };
  const thStyle = { border: '1px solid rgba(63, 63, 70, 0.5)', padding: '8px', textAlign: 'left' as const, backgroundColor: 'rgba(39, 39, 42, 0.5)' };
  const tdStyle = { border: '1px solid rgba(63, 63, 70, 0.5)', padding: '8px' };
  const copyableCellStyle = { ...tdStyle, fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer' };

  const statusColors: Record<string, { bg: string; text: string }> = {
    NOT_RECORDED: { bg: 'rgba(161, 161, 170, 0.1)', text: '#a1a1aa' },
    RECORDED: { bg: 'rgba(96, 165, 250, 0.1)', text: '#60a5fa' },
    EDITED: { bg: 'rgba(250, 204, 21, 0.1)', text: '#facc15' },
    READY_TO_POST: { bg: 'rgba(45, 212, 191, 0.1)', text: '#2dd4bf' },
    POSTED: { bg: 'rgba(52, 211, 153, 0.1)', text: '#34d399' },
    REJECTED: { bg: 'rgba(248, 113, 113, 0.1)', text: '#f87171' },
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }} className="pb-24 lg:pb-6">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Execution Dashboard</h1>
        <button type="button" onClick={fetchData} style={{ padding: '8px 16px' }}>Refresh</button>
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '20px', padding: '10px', backgroundColor: 'rgba(248, 113, 113, 0.1)', borderRadius: '8px', border: '1px solid rgba(248, 113, 113, 0.2)' }}>{error}</div>}

      {/* Filters */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'rgba(39, 39, 42, 0.5)', borderRadius: '8px', border: '1px solid rgba(63, 63, 70, 0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <label style={{ fontWeight: 'bold' }}>Filter by Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px', border: '1px solid rgba(63, 63, 70, 0.5)', borderRadius: '8px', width: '100%', backgroundColor: 'rgba(39, 39, 42, 0.5)', color: '#e4e4e7' }}
          >
            <option value="">All Statuses</option>
            {RECORDING_STATUSES.filter(s => s).map(status => (
              <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <span style={{ color: '#666', fontSize: '14px' }}>
            Showing {videos.length} video{videos.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Videos Table */}
      {loading ? (
        <p>Loading videos...</p>
      ) : videos.length === 0 ? (
        <EmptyState
          title="No videos found"
          description={statusFilter
            ? `No videos with status "${statusFilter.replace(/_/g, ' ')}". Try changing the filter.`
            : "Videos in the execution pipeline will appear here."}
        />
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Video ID</th>
              <th style={thStyle}>Recording Status</th>
              <th style={thStyle}>Last Changed</th>
              <th style={thStyle}>Platform</th>
              <th style={thStyle}>Posted URL</th>
              <th style={thStyle}>Script Preview</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => {
              const statusStyle = statusColors[video.recording_status] || statusColors.NOT_RECORDED;
              return (
                <tr key={video.id}>
                  <td
                    style={copyableCellStyle}
                    onClick={() => copyToClipboard(video.id, `vid-${video.id}`)}
                    title="Click to copy full ID"
                  >
                    {video.id.slice(0, 8)}...
                    {copiedId === `vid-${video.id}` && <span style={{ marginLeft: '5px', color: 'green', fontSize: '10px' }}>Copied!</span>}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.text,
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}>
                      {video.recording_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={tdStyle} title={video.last_status_changed_at ? formatDateString(video.last_status_changed_at) : ''}>
                    {displayTime(video.last_status_changed_at)}
                  </td>
                  <td style={tdStyle}>
                    {video.posted_platform ? (
                      <span style={{ textTransform: 'capitalize' }}>{video.posted_platform}</span>
                    ) : (
                      <span style={{ color: '#999' }}>-</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {video.posted_url ? (
                      <a
                        href={video.posted_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#0066cc', textDecoration: 'none', fontSize: '12px' }}
                      >
                        Open &rarr;
                      </a>
                    ) : (
                      <span style={{ color: '#999' }}>-</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: '250px', fontSize: '12px', color: '#666' }}>
                    {video.script_locked_text ? (
                      <span title={video.script_locked_text}>
                        {video.script_locked_text.slice(0, 120)}
                        {video.script_locked_text.length > 120 ? '...' : ''}
                      </span>
                    ) : (
                      <span style={{ color: '#999', fontStyle: 'italic' }}>No script</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <Link
                      href={`/admin/pipeline/${video.id}`}
                      style={{ color: '#0066cc', textDecoration: 'none', fontSize: '13px' }}
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
