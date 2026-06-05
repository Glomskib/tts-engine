'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, User, Loader2, Sparkles, Mic, Camera as CameraIcon, Check, AlertCircle, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';

interface Avatar {
  id: string;
  name: string;
  avatar_display_name?: string;
  niche?: string;
  personality?: string;
  target_audience?: string;
  avatar_visual_reference_url?: string;
  heygen_custom_avatar_id?: string;
  heygen_register_status?: 'processing' | 'success' | 'failed' | null;
  heygen_register_error?: string | null;
  heygen_register_attempts?: number;
  heygen_register_attempted_at?: string | null;
  voice_clone_id?: string;
  setup_status?: string;
  test_render_url?: string;
  updated_at: string;
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [authErr, setAuthErr] = useState(false);
  // Surface API failures so this page stops silently showing an empty state
  // when something's broken (incident 2026-05-27 — "Avatar — Nothing in this
  // ever seems to work right or load").
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function deleteAvatar(id: string, name: string) {
    if (!confirm(`Delete avatar "${name}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/avatars/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
      }
      // Refresh list
      window.location.reload();
    } catch (e) {
      alert('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function loadAvatars() {
    setFetchError(null);
    setRefreshing(true);
    try {
      const r = await fetch('/api/avatars', { cache: 'no-store' });
      if (r.status === 401) {
        setAuthErr(true);
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = (j as { error?: string }).error || `Server returned ${r.status}`;
        setFetchError(msg);
        return;
      }
      const j = await r.json() as { avatars?: Avatar[]; ok?: boolean; error?: string };
      if (j.error) {
        setFetchError(j.error);
        return;
      }
      const list = j.avatars || [];
      setAvatars(list);

      // 2026-05-31: heal existing avatars that have a photo URL but never
      // got registered with HeyGen (created before the auto-register fix in
      // /avatars/new). For each one, fire the register-photo endpoint in
      // the background. Idempotent — endpoint short-circuits when
      // heygen_custom_avatar_id is already set.
      //
      // 2026-06-01: only auto-fire if attempts<3 OR no attempt has happened
      // yet (status IS NULL). Otherwise we'd hammer HeyGen forever on a
      // permanently-bad URL. The avatar card surfaces a manual "Retry" button
      // for the >=3-attempt cases.
      const stragglers = list.filter(a =>
        a.avatar_visual_reference_url &&
        !a.heygen_custom_avatar_id &&
        ((a.heygen_register_attempts || 0) < 3 || !a.heygen_register_status)
      );
      if (stragglers.length > 0) {
        console.log(`[avatars] healing ${stragglers.length} avatar(s) missing HeyGen registration`);
        for (const a of stragglers) {
          // 2026-06-05: surface heal-loop responses to the console so we see
          // why an avatar isn't healing (e.g. 404 ownership mismatch, 403 plan
          // tier, 5xx server bug). Previously errors were silently swallowed
          // with .catch(()=>{}) and the row's heygen_register_error was the
          // only signal — which is invisible when an /api/avatars filter
          // returns the row but the register-photo route doesn't recognize it.
          fetch(`/api/avatars/${a.id}/heygen/register-photo`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          })
            .then(async (r) => {
              if (!r.ok) {
                const body = await r.text().catch(() => '');
                console.warn(`[avatars] heal ${a.id} (${a.avatar_display_name || a.name}) → ${r.status}: ${body.slice(0, 200)}`);
              }
            })
            .catch((e) => {
              console.warn(`[avatars] heal ${a.id} network error:`, e);
            });
        }
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Network error — check your connection');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAvatars();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-teal-400" /> Your AI Cast
            </h1>
            <p className="text-sm text-zinc-300 mt-1">
              Your AI talent. Same face every video. Drop in, hit record.
            </p>
          </div>
          <Link
            href="/avatars/new"
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New avatar
          </Link>
        </div>

        {authErr && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-center">
            <div className="text-sm text-zinc-200 mb-3">Sign in to see your avatars.</div>
            <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold">Sign in</Link>
          </div>
        )}

        {!authErr && loading && (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-teal-400" /></div>
        )}

        {!authErr && !loading && fetchError && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-amber-100 mb-1">
                  Couldn&apos;t load your avatars
                </div>
                <div className="text-xs text-amber-200/80 mb-3 break-words font-mono">
                  {fetchError}
                </div>
                <div className="text-[11px] text-amber-200/70 mb-3">
                  Common causes: render worker offline, brand_profiles table missing,
                  or your session expired. If this keeps happening, copy the message
                  above and ping support.
                </div>
                <button
                  onClick={loadAvatars}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-900 text-xs font-semibold"
                >
                  {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {!authErr && !loading && !fetchError && avatars.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-zinc-600 bg-zinc-900/40 p-10 text-center">
            <User className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
            <div className="text-base font-semibold text-white mb-1">No avatars yet</div>
            <div className="text-sm text-zinc-300 mb-5 max-w-md mx-auto">
              Your first avatar is the brand's AI spokesperson. Same face, same voice, same personality across every video.
            </div>
            <Link href="/avatars/new" className="inline-block px-5 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm">
              Create your first avatar
            </Link>
          </div>
        )}

        {avatars.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {avatars.map(a => <AvatarCard key={a.id} a={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function AvatarCard({ a }: { a: Avatar }) {
  // Need a router for the inner "Set voice" link since we can't nest an
  // <a> inside the card-wide <Link>. Anchor inside anchor = invalid HTML.
  const router = useRouter();
  // 2026-05-31: the badge used to say "Photo needed" any time setup wasn't
  // 100% finished — including avatars that already had a photo but were
  // waiting on HeyGen/voice processing. That lied to the user. Now we name
  // the actual missing piece (photo OR processing OR voice OR test render).
  //
  // 2026-06-01: the "Processing photo" badge used to sit forever even when
  // HeyGen had outright rejected the photo (silent failure in the heal
  // loop). Now we read brand_profiles.heygen_register_* columns:
  //   - status='failed'  + attempts>=5  → RED "HeyGen rejected" + retry btn
  //   - status='failed'  + attempts<5   → still in heal-loop range, show
  //                                       "Processing photo" (will auto-retry)
  //   - status='processing' + <5min ago → "Processing photo" (current)
  //   - status='processing' + >5min ago → YELLOW "Photo stuck — retry"
  //   - otherwise → existing setup-step ladder.
  const hasPhoto = !!a.avatar_visual_reference_url;
  const photoProcessed = !!a.heygen_custom_avatar_id;
  const voiceReady = !!a.voice_clone_id;
  const tested = !!a.test_render_url;
  const setupComplete = photoProcessed && voiceReady && tested;

  const regStatus = a.heygen_register_status;
  const regAttempts = a.heygen_register_attempts || 0;
  const regError = a.heygen_register_error || '';
  const lastAttempt = a.heygen_register_attempted_at
    ? new Date(a.heygen_register_attempted_at).getTime()
    : 0;
  const ageMs = lastAttempt ? Date.now() - lastAttempt : 0;
  const STUCK_MS = 5 * 60 * 1000;

  type BadgeTone = 'amber' | 'sky' | 'red' | 'yellow';
  let badge: {
    label: string;
    tone: BadgeTone;
    tooltip?: string;
    retry?: boolean;
  } | null = null;

  if (!setupComplete) {
    if (!hasPhoto) {
      badge = { label: 'Photo needed', tone: 'amber' };
    } else if (!photoProcessed) {
      // Has a photo but HeyGen hasn't returned a custom avatar id yet —
      // crack open the registration-state columns to figure out what's
      // actually going on.
      if (regStatus === 'failed' && regAttempts >= 5) {
        badge = {
          label: 'HeyGen rejected',
          tone: 'red',
          tooltip: regError ? regError.slice(0, 80) : 'HeyGen rejected this photo',
          retry: true,
        };
      } else if (regStatus === 'processing' && ageMs > STUCK_MS) {
        badge = {
          label: 'Photo stuck — retry',
          tone: 'yellow',
          tooltip: 'HeyGen registration has been in-flight for over 5 minutes',
          retry: true,
        };
      } else {
        badge = { label: 'Processing photo', tone: 'sky' };
      }
    } else if (!voiceReady) {
      badge = { label: 'Voice not set', tone: 'amber' };
    } else {
      badge = { label: 'Test render pending', tone: 'sky' };
    }
  }

  const badgeClass =
    badge?.tone === 'red'    ? 'bg-red-500/40 border-red-400 text-red-50' :
    badge?.tone === 'yellow' ? 'bg-yellow-500/30 border-yellow-400 text-yellow-50' :
    badge?.tone === 'sky'    ? 'bg-sky-500/30 border-sky-400 text-sky-100' :
                               'bg-amber-500/30 border-amber-400 text-amber-100';

  async function handleRetry(e: React.MouseEvent) {
    // Don't navigate into the card when the user clicks Retry.
    e.preventDefault();
    e.stopPropagation();
    try {
      const r = await fetch(`/api/avatars/${a.id}/heygen/register-photo?force=true`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert('Retry failed: ' + ((j as { error?: string }).error || `HTTP ${r.status}`));
        return;
      }
      // HeyGen calls are 30-90s synchronous. Reload to pick up the new state.
      window.location.reload();
    } catch (err) {
      alert('Retry failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <Link
      href={`/avatars/${a.id}`}
      className="block rounded-xl border border-zinc-700 hover:border-zinc-500 bg-zinc-900 hover:bg-zinc-800 transition-colors overflow-hidden"
    >
      <div className="aspect-[3/4] bg-zinc-800 relative">
        {a.avatar_visual_reference_url ? (
          <img src={a.avatar_visual_reference_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500">
            <User className="w-16 h-16" />
          </div>
        )}
        {badge && (
          <div
            className={`absolute top-2 right-2 px-2 py-0.5 rounded-full border text-[10px] font-semibold flex items-center gap-1 ${badgeClass}`}
            title={badge.tooltip}
          >
            <AlertCircle className="w-3 h-3" /> {badge.label}
            {badge.retry && (
              <button
                onClick={handleRetry}
                className="ml-1 px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[9px] font-bold uppercase tracking-wide"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold text-white truncate">{a.avatar_display_name || a.name}</div>
        <div className="text-[11px] text-zinc-300 truncate mt-0.5">{a.niche || a.personality || 'No niche set'}</div>
        <div className="flex items-center gap-2 mt-2 text-[10px]">
          <span className={`flex items-center gap-1 ${a.heygen_custom_avatar_id ? 'text-teal-300' : 'text-zinc-400'}`}>
            <CameraIcon className="w-3 h-3" /> {a.heygen_custom_avatar_id ? 'Face' : 'no photo'}
          </span>
          {a.voice_clone_id ? (
            <span className="flex items-center gap-1 text-teal-300">
              <Mic className="w-3 h-3" /> Voice set
            </span>
          ) : (
            // "voice unset" used to be silent text — now it's a clickable
            // "button" that drops the user on the detail page's #voice
            // anchor so they land right on the voice picker. We can't use
            // a Link here because the whole card is already wrapped in
            // one (nested <a> is invalid HTML) — use router.push instead.
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/avatars/${a.id}#voice`);
              }}
              className="flex items-center gap-1 text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline"
            >
              <Mic className="w-3 h-3" /> Set voice →
            </button>
          )}
          <span className={`flex items-center gap-1 ${a.test_render_url ? 'text-emerald-300' : 'text-zinc-400'}`}>
            <Check className="w-3 h-3" /> {a.test_render_url ? 'Tested' : 'not filmed yet'}
          </span>
        </div>
      </div>
    </Link>
  );
}
