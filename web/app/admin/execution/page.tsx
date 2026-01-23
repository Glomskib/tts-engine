'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';

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
    } catch (err) {
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
  const thStyle = { border: '1px solid #ccc', padding: '8px', textAlign: 'left' as const, backgroundColor: '#f5f5f5' };
  const tdStyle = { border: '1px solid #ccc', padding: '8px' };
  const copyableCellStyle = { ...tdStyle, fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer' };

  const statusColors: Record<string, { bg: string; text: string }> = {
    NOT_RECORDED: { bg: '#e2e3e5', text: '#383d41' },
    RECORDED: { bg: '#fff3cd', text: '#856404' },
    EDITED: { bg: '#cce5ff', text: '#004085' },
    READY_TO_POST: { bg: '#d1ecf1', text: '#0c5460' },
    POSTED: { bg: '#d4edda', text: '#155724' },
    REJECTED: { bg: '#f8d7da', text: '#721c24' },
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Execution Dashboard</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/admin/pipeline" style={{ padding: '8px 16px', textDecoration: 'none', color: '#333', border: '1px solid #ccc', borderRadius: '4px' }}>
            &larr; Pipeline
          </Link>
          <button onClick={fetchData} style={{ padding: '8px 16px' }}>Refresh</button>
        </div>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '20px', padding: '10px', backgroundColor: '#fee', borderRadius: '4px' }}>{error}</div>}

      {/* Filters */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <label style={{ fontWeight: 'bold' }}>Filter by Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '180px' }}
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
        <p style={{ color: '#666' }}>No videos found{statusFilter ? ` with status "${statusFilter}"` : ''}.</p>
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
