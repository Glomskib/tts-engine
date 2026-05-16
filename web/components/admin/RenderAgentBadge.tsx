'use client';

/**
 * RenderAgentBadge — surfaces render-node health to the editor.
 *
 * Backed by GET /api/render-jobs/heartbeat which returns the list of known
 * render nodes with an `online` flag (true when seen in the last 90s).
 *
 * Renders a single pill summarising the fleet:
 *   • All nodes offline / no nodes registered  → red "Render: offline"
 *   • At least one node online                 → green "Render: online · <N> node(s)"
 *   • Loading / unknown                        → gray "Render: …"
 *
 * Hover reveals the most-recent heartbeat per node + current job id.
 * Click opens /admin/render-jobs for the full queue.
 *
 * Polls every 30s with a 5s timeout per fetch. Silently degrades on auth
 * issues — we don't want to spam errors on the editor page.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, Loader2 } from 'lucide-react';

interface RenderNode {
  node_id: string;
  last_seen: string;
  online: boolean;
  current_job_id?: string | null;
  ffmpeg_version?: string | null;
  platform?: string | null;
}

interface HeartbeatResponse {
  nodes?: RenderNode[];
}

function relativeAge(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'never';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function RenderAgentBadge() {
  const [state, setState] = useState<'loading' | 'online' | 'offline' | 'error'>('loading');
  const [nodes, setNodes] = useState<RenderNode[]>([]);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch('/api/render-jobs/heartbeat', {
          credentials: 'include',
          signal: ctrl.signal,
        });
        if (!res.ok) {
          if (!cancelled) setState('error');
          return;
        }
        const data: HeartbeatResponse = await res.json().catch(() => ({}));
        if (cancelled) return;
        const ns = Array.isArray(data.nodes) ? data.nodes : [];
        setNodes(ns);
        setState(ns.some((n) => n.online) ? 'online' : 'offline');
      } catch {
        if (!cancelled) setState('error');
      } finally {
        clearTimeout(timer);
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const onlineCount = nodes.filter((n) => n.online).length;

  let label: string;
  let cls: string;
  let Icon = Activity;
  if (state === 'loading') {
    label = 'Render: …';
    cls = 'bg-zinc-700/40 text-zinc-300 ring-zinc-600/40';
    Icon = Loader2;
  } else if (state === 'online') {
    label = `Render: online${nodes.length > 1 ? ` · ${onlineCount}/${nodes.length}` : ''}`;
    cls = 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30';
  } else if (state === 'offline') {
    label = nodes.length === 0 ? 'Render: no agent' : 'Render: offline';
    cls = 'bg-rose-500/15 text-rose-300 ring-rose-400/30';
    Icon = AlertTriangle;
  } else {
    label = 'Render: ?';
    cls = 'bg-amber-500/15 text-amber-300 ring-amber-400/30';
    Icon = AlertTriangle;
  }

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Link
        href="/admin/render-jobs"
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ring-1 ${cls} hover:brightness-110 transition`}
        aria-label="Render agent status"
      >
        <Icon className={`w-3 h-3 ${state === 'loading' ? 'animate-spin' : ''}`} />
        {label}
      </Link>

      {hover && (
        <div
          className="absolute right-0 mt-2 w-72 z-50 rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur-sm p-3 text-[11px] text-zinc-200 shadow-xl"
          role="tooltip"
        >
          {state === 'offline' && nodes.length === 0 && (
            <>
              <div className="font-semibold text-rose-300 mb-1">No render agent registered.</div>
              <div className="text-zinc-400">
                Make sure your Mac mini render agent is running. Edit jobs will queue and start as soon as one comes online.
              </div>
            </>
          )}
          {state === 'offline' && nodes.length > 0 && (
            <>
              <div className="font-semibold text-rose-300 mb-1">Render agent offline.</div>
              <div className="text-zinc-400 mb-2">
                Last seen {relativeAge(nodes[0]?.last_seen)}. Jobs you start now will queue and run when it reconnects.
              </div>
            </>
          )}
          {state === 'online' && (
            <div className="font-semibold text-emerald-300 mb-1">Render agent online.</div>
          )}
          {nodes.length > 0 && (
            <ul className="space-y-1.5 mt-2 max-h-44 overflow-auto">
              {nodes.map((n) => (
                <li key={n.node_id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{n.node_id}</div>
                    <div className="text-zinc-500 text-[10px]">
                      {n.platform ? `${n.platform} · ` : ''}seen {relativeAge(n.last_seen)}
                      {n.current_job_id ? ` · running ${n.current_job_id.slice(0, 8)}…` : ''}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2 h-2 rounded-full ${n.online ? 'bg-emerald-400' : 'bg-rose-400'}`}
                    aria-hidden
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 pt-2 border-t border-zinc-800 text-zinc-500 text-[10px]">
            Click the badge for the full queue.
          </div>
        </div>
      )}
    </div>
  );
}
