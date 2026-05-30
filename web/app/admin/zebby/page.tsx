'use client';

/**
 * /admin/zebby — Zebby's World content engine console.
 *
 * Single entry point for the YouTube atomization play. Paste a Zebby episode
 * URL, pick a target clip count, kick off a zebby-mode ve_run, then watch the
 * runs list refresh as the engine transcribes, scores, and renders.
 *
 * Each run links to the existing /video-engine/[id] processing page so the
 * full preview / approve / regenerate UI is reused without duplication.
 *
 * Pre-launch UX note: the brand panel surfaces which CTAs will go live once
 * NEXT_PUBLIC_ZEBBY_APP_URL / KICKSTARTER_URL are set in Vercel. Until then
 * captions fall back to "Coming soon" / "Link in bio" copy via brand-config.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import AdminPageLayout, {
  AdminCard,
  AdminButton,
} from '@/app/admin/components/AdminPageLayout';
import { SectionLoader } from '@/components/ui/BrandedLoader';
import {
  ZEBBY_HANDLES,
  ZEBBY_YOUTUBE_CHANNEL_URL,
  isAppLive,
  getZebbyAppUrl,
  getZebbyKickstarterUrl,
} from '@/lib/zebby/brand-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VeRun {
  id: string;
  mode: string;
  status: string;
  target_clip_count: number;
  preset_keys: string[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  plan_id_at_run: string | null;
}

interface IngestResponse {
  ok: boolean;
  data?: {
    run_id: string;
    storage_path: string;
    duration_sec: number;
    byte_size: number;
    source: string;
  };
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ZebbyAdminPage() {
  const { user, loading: authLoading } = useAuth();

  const [url, setUrl] = useState('');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [targetClipCount, setTargetClipCount] = useState(8);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestSuccess, setIngestSuccess] = useState<{ runId: string; durationSec: number } | null>(null);

  const [runs, setRuns] = useState<VeRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/video-engine/runs?limit=50');
      const json = await res.json();
      if (json.ok) {
        const zebbyRuns = (json.data.runs as VeRun[]).filter((r) => r.mode === 'zebby');
        setRuns(zebbyRuns);
      }
    } catch (err) {
      console.error('[zebby admin] failed to fetch runs:', err);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      fetchRuns();
      const interval = setInterval(fetchRuns, 5000); // refresh while runs are processing
      return () => clearInterval(interval);
    }
  }, [authLoading, user, fetchRuns]);

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    setIngestError(null);
    setIngestSuccess(null);
    setIngesting(true);

    try {
      const res = await fetch('/api/zebby/ingest/youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          target_clip_count: targetClipCount,
          source_episode_title: episodeTitle.trim() || undefined,
        }),
      });
      const json: IngestResponse = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        setIngestError(json.error?.message ?? `Ingest failed (HTTP ${res.status})`);
        return;
      }
      setIngestSuccess({ runId: json.data.run_id, durationSec: json.data.duration_sec });
      setUrl('');
      setEpisodeTitle('');
      fetchRuns();
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIngesting(false);
    }
  }

  if (authLoading) {
    return (
      <AdminPageLayout title="Zebby's World" subtitle="Content engine">
        <SectionLoader />
      </AdminPageLayout>
    );
  }

  if (!user) {
    return (
      <AdminPageLayout title="Zebby's World" subtitle="Content engine">
        <AdminCard>
          <p>Sign in to use the Zebby content engine.</p>
        </AdminCard>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Zebby's World"
      subtitle="Atomize YouTube episodes into platform-native shorts"
    >
      {/* Brand readiness panel — shows which CTAs are live vs pre-launch */}
      <AdminCard title="Brand readiness">
        <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
          <BrandReadinessRow
            label="TikTok / IG / YouTube / Facebook"
            handle={ZEBBY_HANDLES.tiktok}
            ready={true}
            note="Live — follow_herd CTA active across all platforms"
          />
          <BrandReadinessRow
            label="Zebby's World YouTube channel"
            handle={ZEBBY_YOUTUBE_CHANNEL_URL}
            ready={true}
            note="Source episodes pulled from here"
            href={ZEBBY_YOUTUBE_CHANNEL_URL}
          />
          <BrandReadinessRow
            label="App install URL"
            handle={getZebbyAppUrl() ?? 'NEXT_PUBLIC_ZEBBY_APP_URL not set'}
            ready={isAppLive()}
            note={
              isAppLive()
                ? 'install_app CTA active'
                : 'install_app CTA falls back to "Coming soon" copy'
            }
          />
          <BrandReadinessRow
            label="Kickstarter URL"
            handle={getZebbyKickstarterUrl() ?? 'NEXT_PUBLIC_ZEBBY_KICKSTARTER_URL not set'}
            ready={Boolean(getZebbyKickstarterUrl())}
            note={
              getZebbyKickstarterUrl()
                ? 'back_kickstarter CTA active'
                : 'back_kickstarter CTA falls back to "Coming soon" copy'
            }
          />
        </div>
      </AdminCard>

      {/* Ingest form */}
      <AdminCard title="Ingest a YouTube episode">
        <form onSubmit={handleIngest} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>YouTube URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              disabled={ingesting}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>
              Episode title <span style={{ fontWeight: 400, opacity: 0.7 }}>(optional)</span>
            </span>
            <input
              type="text"
              value={episodeTitle}
              onChange={(e) => setEpisodeTitle(e.target.value)}
              placeholder="e.g. Episode 3: The Floating Spoon"
              disabled={ingesting}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>Target clips per run (1–8)</span>
            <input
              type="number"
              min={1}
              max={8}
              value={targetClipCount}
              onChange={(e) => setTargetClipCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
              disabled={ingesting}
              style={{ ...inputStyle, width: 100 }}
            />
          </label>
          <AdminButton type="submit" disabled={ingesting || !url.trim()}>
            {ingesting ? 'Downloading + queueing…' : 'Ingest with Zebby mode'}
          </AdminButton>
          {ingestError && (
            <div role="alert" style={errorBoxStyle}>
              {ingestError}
            </div>
          )}
          {ingestSuccess && (
            <div role="status" style={successBoxStyle}>
              ✅ Run created (duration {Math.round(ingestSuccess.durationSec)}s).{' '}
              <Link
                href={`/video-engine/${ingestSuccess.runId}`}
                style={{ textDecoration: 'underline' }}
              >
                Open run →
              </Link>
            </div>
          )}
        </form>
      </AdminCard>

      {/* Recent Zebby runs */}
      <AdminCard
        title="Recent Zebby runs"
        headerActions={
          <button
            onClick={() => {
              setRunsLoading(true);
              fetchRuns();
            }}
            style={refreshButtonStyle}
          >
            Refresh
          </button>
        }
      >
        {runsLoading ? (
          <SectionLoader />
        ) : runs.length === 0 ? (
          <p style={{ opacity: 0.7 }}>
            No Zebby runs yet. Ingest your first episode above to see it appear here.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function BrandReadinessRow({
  label,
  handle,
  ready,
  note,
  href,
}: {
  label: string;
  handle: string;
  ready: boolean;
  note: string;
  href?: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr',
        gap: 8,
        alignItems: 'baseline',
      }}
    >
      <span style={{ fontSize: 16 }}>{ready ? '✅' : '⚠️'}</span>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ opacity: 0.85, fontFamily: 'monospace', fontSize: 13 }}>
          {href ? (
            <a href={href} target="_blank" rel="noreferrer">
              {handle}
            </a>
          ) : (
            handle
          )}
        </div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>{note}</div>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: VeRun }) {
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const created = new Date(run.created_at);
  const ago = humanAgo(created);
  const statusColor = statusColorFor(run.status);
  const canDispatch = run.status === 'complete';

  async function handleDispatch(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dispatching) return;
    setDispatching(true);
    setDispatchResult(null);
    try {
      const res = await fetch('/api/zebby/posting/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_id: run.id, publish_now: false }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setDispatchResult(`❌ ${json?.error?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setDispatchResult(`✅ ${json.dispatched} posted, ${json.skipped} skipped`);
    } catch (err) {
      setDispatchResult(`❌ ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr 90px 120px 110px',
        gap: 12,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: 12,
          background: statusColor.bg,
          color: statusColor.fg,
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
      >
        {run.status}
      </span>
      <Link
        href={`/video-engine/${run.id}`}
        style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.85, textDecoration: 'underline' }}
      >
        {run.id.slice(0, 8)}…
      </Link>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{run.target_clip_count} clips</span>
      <button
        onClick={handleDispatch}
        disabled={!canDispatch || dispatching}
        title={canDispatch ? 'Post all complete clips in this run to Zebby socials' : 'Run must be complete before dispatch'}
        style={{
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid rgba(182,143,255,0.4)',
          background: canDispatch && !dispatching ? 'rgba(182,143,255,0.15)' : 'transparent',
          color: canDispatch ? '#D6BFFF' : 'rgba(255,255,255,0.3)',
          cursor: canDispatch && !dispatching ? 'pointer' : 'not-allowed',
          fontSize: 12,
        }}
      >
        {dispatching ? 'Posting…' : 'Dispatch'}
      </button>
      <span style={{ fontSize: 11, opacity: 0.7, textAlign: 'right' }}>
        {dispatchResult ? dispatchResult : ago}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline for the page; existing admin pages mix inline + utility)
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(0,0,0,0.2)',
  color: 'inherit',
  fontSize: 14,
};

const errorBoxStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 6,
  border: '1px solid rgba(229,57,53,0.5)',
  background: 'rgba(229,57,53,0.1)',
  color: '#FFB4B0',
  fontSize: 13,
};

const successBoxStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 6,
  border: '1px solid rgba(26,174,91,0.5)',
  background: 'rgba(26,174,91,0.1)',
  color: '#9AE5B5',
  fontSize: 13,
};

const refreshButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanAgo(d: Date): string {
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

function statusColorFor(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'complete':
      return { bg: 'rgba(26,174,91,0.18)', fg: '#9AE5B5' };
    case 'failed':
      return { bg: 'rgba(229,57,53,0.18)', fg: '#FFB4B0' };
    case 'rendering':
    case 'assembling':
      return { bg: 'rgba(102,178,255,0.18)', fg: '#A8D3FF' };
    case 'transcribing':
    case 'analyzing':
      return { bg: 'rgba(255,180,0,0.18)', fg: '#FFD58A' };
    default:
      return { bg: 'rgba(255,255,255,0.08)', fg: 'inherit' };
  }
}
