'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * TikTok Draft Export Component
 *
 * Reusable component to send a rendered content item to TikTok draft (inbox).
 * Shows connection status, export button, progress, and post-export guidance.
 */

interface TikTokDraftExportProps {
  contentItemId: string;
  hasRenderedVideo: boolean;
  /** Existing draft status from content item if available */
  initialStatus?: string | null;
  initialError?: string | null;
}

interface ContentAccount {
  account_id: string;
  account_name: string;
  account_handle: string;
  content_connection: {
    status: string;
    display_name: string | null;
  } | null;
}

type DraftStatus = 'idle' | 'pending' | 'processing' | 'sent' | 'failed';

export default function TikTokDraftExport({
  contentItemId,
  hasRenderedVideo,
  initialStatus,
  initialError,
}: TikTokDraftExportProps) {
  const [accounts, setAccounts] = useState<ContentAccount[]>([]);
  const [appConfigured, setAppConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [status, setStatus] = useState<DraftStatus>((initialStatus as DraftStatus) || 'idle');
  const [error, setError] = useState<string | null>(initialError || null);
  const [exporting, setExporting] = useState(false);

  // Fetch TikTok content accounts
  useEffect(() => {
    fetch('/api/tiktok-content/status')
      .then(r => r.json())
      .then(json => {
        if (json.ok) {
          const accts = (json.data.accounts || []).filter(
            (a: ContentAccount) => a.content_connection?.status === 'active'
          );
          setAccounts(accts);
          setAppConfigured(json.data.app_configured);
          if (accts.length === 1) {
            setSelectedAccount(accts[0].account_id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Poll status if pending/processing
  const pollStatus = useCallback(async () => {
    if (status !== 'pending' && status !== 'processing') return;
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/tiktok-draft`);
      const json = await res.json();
      if (json.ok && json.data) {
        const newStatus = json.data.status as DraftStatus;
        if (newStatus) setStatus(newStatus);
        if (json.data.error) setError(json.data.error);
      }
    } catch {
      // ignore polling errors
    }
  }, [contentItemId, status]);

  useEffect(() => {
    if (status !== 'pending' && status !== 'processing') return;
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [status, pollStatus]);

  const handleExport = async () => {
    if (!selectedAccount || !hasRenderedVideo) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/tiktok-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus('pending');
      } else {
        setError(json.error || 'Export failed');
        setStatus('failed');
      }
    } catch {
      setError('Failed to start export');
      setStatus('failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-xs text-zinc-500 py-2">Checking TikTok connection...</div>
    );
  }

  // Not configured at all
  if (!appConfigured) {
    return null; // Don't show anything if TikTok isn't configured
  }

  // No connected accounts
  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/30 p-3">
        <p className="text-xs text-zinc-500">
          No TikTok account connected for content posting.{' '}
          <a href="/admin/settings/tiktok" className="text-blue-400 hover:text-blue-300">
            Connect in Settings
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">TikTok Draft Export</span>
        {status === 'sent' && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-400/10 text-emerald-400 border border-emerald-400/30">
            Sent
          </span>
        )}
        {(status === 'pending' || status === 'processing') && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-400/10 text-blue-400 border border-blue-400/30">
            {status === 'pending' ? 'Queued' : 'Sending...'}
          </span>
        )}
      </div>

      {/* Sent — success + next steps */}
      {status === 'sent' && (
        <div className="space-y-2">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <p className="text-xs text-emerald-300 font-medium">Video sent to your TikTok inbox.</p>
          </div>
          <div className="text-[11px] text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">Next steps:</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>Open TikTok and check your inbox/drafts</li>
              <li>Attach TikTok Shop product if applicable</li>
              <li>Review caption, hashtags, and cover image</li>
              <li>Publish when ready</li>
            </ol>
          </div>
        </div>
      )}

      {/* Pending/Processing */}
      {(status === 'pending' || status === 'processing') && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs text-blue-300">
            {status === 'pending' ? 'Export queued, processing...' : 'Sending to TikTok...'}
          </span>
        </div>
      )}

      {/* Failed */}
      {status === 'failed' && error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Export controls — show when idle or failed */}
      {(status === 'idle' || status === 'failed') && (
        <>
          {accounts.length > 1 && (
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 text-zinc-200 rounded px-2 py-1 text-xs"
            >
              <option value="">Select account...</option>
              {accounts.map(a => (
                <option key={a.account_id} value={a.account_id}>
                  {a.account_name} ({a.account_handle})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || !selectedAccount || !hasRenderedVideo}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition disabled:opacity-40 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-600/50"
          >
            {exporting ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
                Sending...
              </>
            ) : (
              <>Send to TikTok Draft</>
            )}
          </button>
          {!hasRenderedVideo && (
            <p className="text-[10px] text-zinc-600">Render the video first to enable draft export.</p>
          )}
          {status === 'failed' && (
            <p className="text-[10px] text-zinc-600">You can retry the export.</p>
          )}
        </>
      )}
    </div>
  );
}
