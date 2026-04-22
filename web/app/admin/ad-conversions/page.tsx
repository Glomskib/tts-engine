'use client';

import { useState, useEffect, useCallback } from 'react';

interface LogRow {
  id: string;
  created_at: string;
  platform: 'meta' | 'tiktok' | 'google';
  event_id: string;
  event_name: string;
  status: 'sent' | 'failed' | 'skipped';
  http_status: number | null;
  error: string | null;
  correlation_id: string | null;
  request_payload: unknown;
  response_body: unknown;
}

const STATUS_BADGE: Record<LogRow['status'], string> = {
  sent: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  skipped: 'bg-zinc-500/20 text-zinc-400',
};

const PLATFORM_BADGE: Record<LogRow['platform'], string> = {
  meta: 'bg-blue-500/20 text-blue-400',
  tiktok: 'bg-pink-500/20 text-pink-400',
  google: 'bg-amber-500/20 text-amber-400',
};

export default function AdConversionsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [eventId, setEventId] = useState('');
  const [selected, setSelected] = useState<LogRow | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (platform) params.set('platform', platform);
      if (status) params.set('status', status);
      if (eventId) params.set('event_id', eventId);
      const res = await fetch(`/api/admin/ad-conversions?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || 'Failed to load');
      setRows(json.data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [platform, status, eventId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Ad Conversion Logs</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Server-to-server Purchase events sent to Meta CAPI, TikTok Events API, and Google Ads.
          One row per platform per Stripe checkout.
        </p>

        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm"
          >
            <option value="">All platforms</option>
            <option value="meta">Meta</option>
            <option value="tiktok">TikTok</option>
            <option value="google">Google</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </select>
          <input
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="Filter by Stripe session ID"
            className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm flex-1 min-w-[240px]"
          />
          <button
            onClick={fetchRows}
            className="bg-indigo-600 hover:bg-indigo-500 rounded px-4 py-1.5 text-sm font-medium"
          >
            Refresh
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/40 rounded p-3 text-red-400 mb-4">{error}</div>}

        <div className="bg-zinc-900 border border-zinc-800 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-zinc-400">
              <tr>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Platform</th>
                <th className="text-left px-3 py-2">Event</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">HTTP</th>
                <th className="text-left px-3 py-2">Event ID</th>
                <th className="text-left px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-6 text-zinc-500">Loading...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-zinc-500">No log entries yet</td></tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="border-t border-zinc-800 hover:bg-zinc-800/40 cursor-pointer"
                >
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${PLATFORM_BADGE[r.platform]}`}>{r.platform}</span>
                  </td>
                  <td className="px-3 py-2">{r.event_name}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{r.http_status ?? '—'}</td>
                  <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{r.event_id.slice(0, 24)}...</td>
                  <td className="px-3 py-2 text-red-400 text-xs max-w-[280px] truncate">{r.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50"
            onClick={() => setSelected(null)}
          >
            <div
              className="bg-zinc-900 border border-zinc-800 rounded max-w-3xl w-full max-h-[80vh] overflow-auto p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {selected.platform} / {selected.event_name} / {selected.status}
                </h2>
                <button onClick={() => setSelected(null)} className="text-zinc-400 hover:text-white">✕</button>
              </div>
              <div className="text-xs text-zinc-400 mb-3 font-mono">event_id: {selected.event_id}</div>
              <h3 className="text-xs uppercase text-zinc-500 mt-4 mb-1">Request</h3>
              <pre className="bg-zinc-950 p-3 rounded text-xs overflow-auto">
                {JSON.stringify(selected.request_payload, null, 2)}
              </pre>
              <h3 className="text-xs uppercase text-zinc-500 mt-4 mb-1">Response</h3>
              <pre className="bg-zinc-950 p-3 rounded text-xs overflow-auto">
                {JSON.stringify(selected.response_body, null, 2)}
              </pre>
              {selected.error && (
                <>
                  <h3 className="text-xs uppercase text-zinc-500 mt-4 mb-1">Error</h3>
                  <div className="text-red-400 text-sm">{selected.error}</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
