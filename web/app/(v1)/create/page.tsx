'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Sparkles, Package, Link as LinkIcon, Target, Copy, CheckCheck,
  RefreshCcw, BookmarkCheck, Save, X, Loader2, AlertCircle,
  Flame, Plus, ArrowRight, Lock, Video, Send, TrendingUp, Trophy,
  Clapperboard, Camera, Type, ImageIcon, Film, User,
} from 'lucide-react';
import {
  V1_LIMITS, type V1Tier, type UsageSnapshot,
} from '@/lib/v1/usage-limits';
import type { Clip, InputMode, Intent } from '@/lib/v1/clip-generation';
import { INTENT_SPECS } from '@/lib/v1/clip-generation';

const DEFAULT_EXAMPLE = 'portable blender from TikTok shop';

const EXAMPLES = [
  'portable blender from TikTok shop',
  'rosemary hair growth serum',
  'silicone heel liners for flats',
  'collagen creamer for coffee',
];

const MODE_BADGE: Record<InputMode, { label: string; icon: typeof Package }> = {
  product:    { label: 'Product',  icon: Package },
  tiktok_url: { label: 'TikTok',   icon: LinkIcon },
  niche:      { label: 'Niche',    icon: Target },
};

/** Infer which input mode applies from free-form text. */
function detectMode(input: string): InputMode {
  const v = input.trim().toLowerCase();
  if (!v) return 'product';
  if (/^https?:\/\//.test(v) || v.includes('tiktok.com') || v.includes('vm.tiktok') || v.includes('vt.tiktok')) {
    return 'tiktok_url';
  }
  // treat "niche" cues — short phrases ending in creators/moms/etc., or explicit audience words
  if (/\b(niche|audience|creators?|moms?|dads?|gym-?goers|for\s+(?:people|men|women|those))\b/.test(v)) {
    return 'niche';
  }
  return 'product';
}

const INTENTS: Array<{ id: Intent; label: string }> = (Object.entries(INTENT_SPECS) as Array<[Intent, { label: string }]>)
  .map(([id, spec]) => ({ id, label: spec.label }));

const DEFAULT_INTENT: Intent = 'bought_because';

const BATCH_OPTIONS = [5, 10, 20];

/* --------------------------------------------------------------------------
 * Momentum — localStorage-backed behavioral tracking.
 * Intentionally minimal: counts by day, per-clip status, one-line nudges.
 * -------------------------------------------------------------------------- */

type ViewsBucket = 'lt1k' | '1k_10k' | '10k_100k' | '100k_plus';

const VIEWS_LABEL: Record<ViewsBucket, string> = {
  lt1k: '<1k',
  '1k_10k': '1k–10k',
  '10k_100k': '10k–100k',
  '100k_plus': '100k+',
};

interface ClipStatus {
  filmed?: boolean;
  posted?: boolean;
  views?: ViewsBucket;
}

interface DayStat {
  generated: number;
  filmed: number;
  posted: number;
}

interface MomentumState {
  byDay: Record<string, DayStat>;
  clips: Record<string, ClipStatus>;
  dailyPing?: string; // YYYY-MM-DD of last recap shown
}

const MOMENTUM_KEY = 'ff_v1_momentum';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function readMomentum(): MomentumState {
  if (typeof window === 'undefined') return { byDay: {}, clips: {} };
  try {
    const raw = window.localStorage.getItem(MOMENTUM_KEY);
    if (!raw) return { byDay: {}, clips: {} };
    const p = JSON.parse(raw);
    return {
      byDay: p.byDay ?? {},
      clips: p.clips ?? {},
      dailyPing: p.dailyPing,
    };
  } catch {
    return { byDay: {}, clips: {} };
  }
}

function writeMomentum(s: MomentumState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOMENTUM_KEY, JSON.stringify(s));
  } catch {}
}

function useMomentum() {
  const [state, setState] = useState<MomentumState>({ byDay: {}, clips: {} });

  useEffect(() => { setState(readMomentum()); }, []);

  const update = useCallback((fn: (s: MomentumState) => MomentumState) => {
    setState(prev => {
      const next = fn(prev);
      writeMomentum(next);
      return next;
    });
  }, []);

  const bumpDay = useCallback((field: keyof DayStat, by = 1) => {
    update(s => {
      const key = todayKey();
      const day = s.byDay[key] ?? { generated: 0, filmed: 0, posted: 0 };
      return { ...s, byDay: { ...s.byDay, [key]: { ...day, [field]: day[field] + by } } };
    });
  }, [update]);

  const setClip = useCallback((id: string, patch: ClipStatus) => {
    update(s => ({ ...s, clips: { ...s.clips, [id]: { ...(s.clips[id] ?? {}), ...patch } } }));
  }, [update]);

  const markDailyPingShown = useCallback(() => {
    update(s => ({ ...s, dailyPing: todayKey() }));
  }, [update]);

  const today = state.byDay[todayKey()] ?? { generated: 0, filmed: 0, posted: 0 };
  const yesterday = state.byDay[yesterdayKey()];

  return {
    today,
    yesterday,
    clips: state.clips,
    dailyPingShown: state.dailyPing === todayKey(),
    bumpDay,
    setClip,
    markDailyPingShown,
  };
}

export default function CreatePage() {
  const [value, setValue] = useState(DEFAULT_EXAMPLE);
  const [niche, setNiche] = useState('');
  const [intent, setIntent] = useState<Intent>(DEFAULT_INTENT);
  const [batchSize, setBatchSize] = useState<number>(5);
  const [userAdjustedBatch, setUserAdjustedBatch] = useState(false);

  const [clips, setClips] = useState<Clip[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [makingMoreId, setMakingMoreId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<{ reason: string; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const outputRef = useRef<HTMLDivElement | null>(null);
  const autoGenFiredRef = useRef(false);

  // Behavioral momentum — local, per-browser. No backend write.
  const momentum = useMomentum();

  useEffect(() => {
    fetch('/api/clips/usage').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.usage) setUsage(d.usage);
    }).catch(() => {});
  }, []);

  // Auto-generate one starter batch on first load — zero-think entry point.
  useEffect(() => {
    if (autoGenFiredRef.current) return;
    const t = setTimeout(() => {
      if (autoGenFiredRef.current) return;
      if (clips.length > 0 || loading) return;
      autoGenFiredRef.current = true;
      requestClips({
        count: 5,
        replaceAll: true,
        override: { value: DEFAULT_EXAMPLE, mode: 'product', tone: DEFAULT_INTENT, niche: null },
      });
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tier: V1Tier = usage?.tier ?? 'free';
  const limits = V1_LIMITS[tier];
  const batchMax = limits.batchMax;

  // Auto-set batchSize to tier sweet spot once usage loads — but respect user choice.
  useEffect(() => {
    if (!usage || userAdjustedBatch) return;
    const sweet = Math.min(10, batchMax);
    if (sweet !== batchSize) setBatchSize(sweet);
  }, [usage, batchMax, batchSize, userAdjustedBatch]);

  const mode: InputMode = useMemo(() => detectMode(value), [value]);
  const detectedBadge = MODE_BADGE[mode];
  const canGenerate = value.trim().length > 0 && !loading;

  const callGenerate = useCallback(async (payload: {
    mode: InputMode;
    value: string;
    niche: string | null;
    tone: Intent;
    count: number;
    seedAngle?: string | null;
  }) => {
    const res = await fetch('/api/clips/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { status: res.status, data };
  }, []);

  async function requestClips(opts: {
    count: number;
    replaceAll: boolean;
    seedAngle?: string | null;
    insertAfterId?: string | null;
    setLoadingId?: (id: string | null) => void;
    loadingId?: string | null;
    override?: { value?: string; mode?: InputMode; tone?: Intent; niche?: string | null };
  }) {
    setError(null);
    if (opts.replaceAll) setLoading(true);
    if (opts.setLoadingId) opts.setLoadingId(opts.loadingId ?? null);

    try {
      const { status, data } = await callGenerate({
        mode: opts.override?.mode ?? mode,
        value: (opts.override?.value ?? value).trim(),
        niche: opts.override?.niche ?? (niche.trim() || null),
        tone: opts.override?.tone ?? intent,
        count: opts.count,
        seedAngle: opts.seedAngle ?? null,
      });

      if (status === 402) {
        setUpgradeModal({ reason: data.reason, message: data.message });
        if (data.usage) setUsage(data.usage);
        return;
      }
      if (status < 200 || status >= 300) {
        setError(data?.error || 'Generation failed. Try again.');
        return;
      }

      if (opts.replaceAll) {
        setClips(data.clips);
        setSavedId(null);
        requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      } else if (opts.insertAfterId) {
        setClips(prev => {
          const idx = prev.findIndex(c => c.id === opts.insertAfterId);
          if (idx === -1) return [...prev, ...data.clips];
          const next = [...prev];
          next.splice(idx + 1, 0, ...data.clips);
          return next;
        });
      } else {
        setClips(prev => [...prev, ...data.clips]);
      }
      setSource(data.source);
      if (data.usage) setUsage(data.usage);
      if (Array.isArray(data.clips) && data.clips.length > 0) {
        momentum.bumpDay('generated', data.clips.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
      if (opts.setLoadingId) opts.setLoadingId(null);
    }
  }

  function handleGenerate() {
    if (!canGenerate) return;
    requestClips({ count: batchSize, replaceAll: true });
  }

  function handleTryExample() {
    if (loading) return;
    const ex = DEFAULT_EXAMPLE;
    if (value.trim() !== ex) setValue(ex);
    setIntent(DEFAULT_INTENT);
    const count = Math.min(batchSize, batchMax);
    requestClips({
      count,
      replaceAll: true,
      override: { value: ex, mode: 'product', tone: DEFAULT_INTENT, niche: null },
    });
  }

  function handleRegenerate(clip: Clip) {
    setRegeneratingId(clip.id);
    callGenerate({
      mode,
      value: value.trim(),
      niche: niche.trim() || null,
      tone: intent,
      count: 1,
    })
      .then(({ status, data }) => {
        if (status === 402) {
          setUpgradeModal({ reason: data.reason, message: data.message });
          if (data.usage) setUsage(data.usage);
          return;
        }
        if (data.clips?.[0]) {
          setClips(prev => prev.map(c => (c.id === clip.id ? data.clips[0] : c)));
          if (data.usage) setUsage(data.usage);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setRegeneratingId(null));
  }

  function handleMakeMoreLike(clip: Clip) {
    setMakingMoreId(clip.id);
    requestClips({
      count: 5,
      replaceAll: false,
      seedAngle: clip.angle,
      insertAfterId: clip.id,
      setLoadingId: setMakingMoreId,
      loadingId: clip.id,
    });
  }

  function handleMarkFilmed(clip: Clip) {
    const wasFilmed = momentum.clips[clip.id]?.filmed === true;
    momentum.setClip(clip.id, { filmed: !wasFilmed });
    if (!wasFilmed) momentum.bumpDay('filmed', 1);
    else momentum.bumpDay('filmed', -1);
  }

  function handleMarkPosted(clip: Clip) {
    const wasPosted = momentum.clips[clip.id]?.posted === true;
    momentum.setClip(clip.id, { posted: !wasPosted });
    if (!wasPosted) momentum.bumpDay('posted', 1);
    else momentum.bumpDay('posted', -1);
  }

  function handleSetViews(clip: Clip, bucket: ViewsBucket) {
    momentum.setClip(clip.id, { views: bucket });
  }

  function handleMakeWinners() {
    const winners = clips.filter(c => {
      const st = momentum.clips[c.id];
      return st?.filmed || st?.views === '10k_100k' || st?.views === '100k_plus';
    });
    if (winners.length === 0) return;
    const seed = winners[0];
    setMakingMoreId(seed.id);
    requestClips({
      count: 10,
      replaceAll: false,
      seedAngle: seed.angle,
      insertAfterId: seed.id,
      setLoadingId: setMakingMoreId,
      loadingId: seed.id,
    });
  }

  function handleCopy(clip: Clip) {
    const text = formatClip(clip);
    navigator.clipboard.writeText(text);
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleCopyAll() {
    const text = clips.map((c, i) => `━━━ CLIP ${i + 1} ━━━\n${formatClip(c)}`).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  async function handleSave() {
    if (clips.length === 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/clips/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: value.trim().slice(0, 80) || 'Clip set',
          mode, value: value.trim(), niche: niche.trim() || null, tone: intent, clips,
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) setSavedId(data.id);
      else setError(data?.error || 'Save failed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const usageCopy = useMemo(() => {
    if (!usage) return null;
    if (limits.perDay != null) {
      return { line: `You've used ${usage.usedToday} of ${limits.perDay} clips today`, pct: Math.round((usage.usedToday / limits.perDay) * 100) };
    }
    if (limits.perMonth != null) {
      return { line: `${usage.usedThisMonth} of ${limits.perMonth} clips used this month`, pct: Math.round((usage.usedThisMonth / limits.perMonth) * 100) };
    }
    return { line: 'Unlimited plan', pct: 0 };
  }, [usage, limits]);

  const isFree = tier === 'free';

  const showYesterdayPing =
    !!momentum.yesterday &&
    momentum.yesterday.generated > 0 &&
    !momentum.dailyPingShown &&
    momentum.today.generated < momentum.yesterday.generated;

  const winnerCount = clips.filter(c => {
    const st = momentum.clips[c.id];
    return st?.filmed || st?.views === '10k_100k' || st?.views === '100k_plus';
  }).length;

  return (
    <div className="space-y-6">
      {/* Yesterday recap — gentle daily loop hook, one-shot per day */}
      {showYesterdayPing && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm text-amber-100">
            <TrendingUp className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <span>
              Yesterday you generated <span className="font-semibold text-amber-50">{momentum.yesterday!.generated}</span> clips. Ready to beat that?
            </span>
          </div>
          <button
            type="button"
            onClick={() => momentum.markDailyPingShown()}
            className="text-amber-300/70 hover:text-amber-100 p-1"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hero */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight">
            Turn ideas into TikTok clips in seconds
          </h1>
          <p className="text-zinc-400 mt-2 text-sm md:text-[15px]">
            Hooks, scripts, captions — ready to record. Built for TikTok Shop affiliates.
          </p>
          <p className="text-[11.5px] text-zinc-500 mt-1.5">
            Creators using FlashFlow are posting 5–20 clips a day.
          </p>
        </div>
        {usageCopy && (
          <Link
            href="/account"
            className={`
              group flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs no-underline transition-colors
              ${usageCopy.pct >= 80
                ? 'border-amber-400/50 bg-amber-400/10 text-amber-200 hover:border-amber-400'
                : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20'}
            `}
            title="Manage plan"
          >
            <span className="uppercase tracking-wider text-[10px] text-zinc-500 group-hover:text-zinc-400">{limits.label}</span>
            <span className="w-px h-3 bg-white/10" />
            <span>{usageCopy.line}</span>
            {isFree && <ArrowRight className="w-3 h-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />}
          </Link>
        )}
      </div>

      {/* INPUT */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 p-4 md:p-6 space-y-5">
        {/* Main input — one field, any input */}
        <div>
          <div className="relative">
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && canGenerate) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="Paste a product, TikTok link, or niche"
              className="w-full rounded-xl bg-black/40 border border-white/10 pl-4 pr-28 py-4 text-[16px] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/20 transition-colors"
            />
            {value.trim() && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400"
                title={`Detected as ${detectedBadge.label.toLowerCase()}`}
              >
                <detectedBadge.icon className="w-3 h-3" />
                {detectedBadge.label}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-zinc-600 mr-1">Try:</span>
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                type="button"
                onClick={() => setValue(ex)}
                className="rounded-full border border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-300"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Video type + Niche — always visible */}
        <div className="border-t border-white/5 pt-5 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300 mb-2.5">
              Video type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {INTENTS.map(t => {
                const active = intent === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setIntent(t.id)}
                    className={`
                      text-left rounded-md border px-3 py-2 text-[12.5px] font-medium transition-colors
                      ${active
                        ? 'border-amber-400/60 bg-amber-400/10 text-amber-100 shadow-sm'
                        : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-zinc-100'}
                    `}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300 mb-2.5">
              Who it's for <span className="text-zinc-500 font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={niche}
              onChange={e => setNiche(e.target.value)}
              placeholder="e.g. busy moms, EDS/POTS, home baristas"
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/40 focus:outline-none focus:ring-2 focus:ring-amber-400/10"
            />
          </div>
        </div>
      </section>

      {/* GENERATE */}
      <section className="space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1">Batch</span>
            {BATCH_OPTIONS.map(n => {
              const locked = n > batchMax;
              const active = batchSize === n && !locked;
              const requiredTier = n <= V1_LIMITS.creator.batchMax ? 'Creator' : 'Pro';
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    if (locked) {
                      setUpgradeModal({ reason: 'batch_too_large' });
                      return;
                    }
                    setUserAdjustedBatch(true);
                    setBatchSize(n);
                  }}
                  title={locked ? 'Unlock 10–20 clip batches' : `Generate ${n} clips per batch`}
                  className={`
                    inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm border transition-colors
                    ${active
                      ? 'border-amber-400/60 bg-amber-400/10 text-amber-100 shadow-sm'
                      : locked
                      ? 'border-white/5 bg-white/[0.02] text-zinc-500 hover:border-amber-400/30 hover:text-amber-200'
                      : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20'}
                  `}
                >
                  {locked && <Lock className="w-3 h-3" />}
                  <span>{n}</span>
                  {locked && <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-400/70">{requiredTier}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {clips.length === 0 && (
              <button
                type="button"
                onClick={handleTryExample}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-3 text-sm text-zinc-200 disabled:opacity-60"
                title="See a live example — no typing needed"
              >
                <Sparkles className="w-4 h-4" />
                Try example
              </button>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`
                inline-flex items-center justify-center gap-2 rounded-xl px-7 py-4 text-[15px] font-semibold transition-all active:scale-[0.98]
                ${canGenerate
                  ? 'bg-gradient-to-b from-amber-300 to-amber-400 text-black hover:from-amber-200 hover:to-amber-300 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/50 hover:-translate-y-[1px]'
                  : 'bg-white/10 text-zinc-500 cursor-not-allowed'}
              `}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Writing {batchSize} videos…</>
              ) : (
                <><Flame className="w-4 h-4" /> Generate {batchSize} videos</>
              )}
            </button>
          </div>
        </div>

        {loading && <GenerationProgress batchSize={batchSize} />}

        {!loading && isFree && (
          <button
            type="button"
            onClick={() => setUpgradeModal({ reason: 'batch_too_large' })}
            className="text-left text-[11.5px] text-zinc-500 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
          >
            <Lock className="w-3 h-3" />
            Unlock 10–20 clip batches →
          </button>
        )}
      </section>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* First-run: momentum setup — one line, not a doc */}
      {clips.length === 0 && !loading && (
        <section className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 flex items-center gap-3 text-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-400/15 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
            <Flame className="w-4 h-4 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-zinc-200 font-medium">One click, {batchSize} ready-to-film videos.</p>
            <p className="text-xs text-zinc-500 mt-0.5">Each one a different angle. Hook, what to say, what to show, caption, CTA.</p>
          </div>
          <button
            type="button"
            onClick={handleTryExample}
            disabled={loading}
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 px-3 py-1.5 text-xs font-medium text-amber-100"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Try with example
          </button>
        </section>
      )}

      {/* OUTPUT */}
      {clips.length > 0 && (
        <section ref={outputRef} className="space-y-4 pt-2">
          {/* Momentum bar — the main loop */}
          <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-400/[0.08] via-amber-400/[0.03] to-transparent p-3 md:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-amber-300 to-amber-400 text-black px-4 py-2.5 text-sm font-semibold hover:from-amber-200 hover:to-amber-300 shadow-lg shadow-amber-500/25 disabled:opacity-60 active:scale-[0.98] transition-all"
                title="One click, fresh batch"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                {loading ? 'Generating…' : 'Generate new set'}
              </button>
              <div className="text-[13px] leading-tight">
                <div className="text-zinc-100 font-medium">
                  {clips.length} videos ready
                  {source === 'fallback' && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 align-middle">
                      sample
                    </span>
                  )}
                </div>
                <div className="text-xs text-amber-200/90 mt-0.5">
                  <Flame className="inline w-3 h-3 mr-0.5 -mt-0.5" />
                  {usage && usage.usedToday > 0 ? (
                    <>
                      You&apos;ve generated <span className="font-semibold text-amber-100">{usage.usedToday}</span> clip{usage.usedToday === 1 ? '' : 's'} today
                      {usage.usedToday >= 5 && <span className="text-amber-300/80"> — on a roll, keep going.</span>}
                    </>
                  ) : (
                    <>Pick the first <span className="font-semibold text-amber-100">2</span> and film them right now.</>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAll}
                className={`
                  inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors
                  ${copiedAll
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200'}
                `}
              >
                {copiedAll ? <><CheckCheck className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy all</>}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !!savedId}
                className={`
                  inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors
                  ${savedId ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200'}
                  ${saving ? 'opacity-60' : ''}
                `}
              >
                {savedId ? <><BookmarkCheck className="w-4 h-4" /> Saved</> : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving</> : <><Save className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>

          {/* FILM THIS NOW banner — top priority, pre-grid */}
          <div className="rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-400/[0.1] to-transparent px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-400/15 border border-amber-400/40 flex items-center justify-center flex-shrink-0">
                <Flame className="w-4 h-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-amber-100">Pick 2 and film them right now.</div>
                <div className="text-[11.5px] text-amber-200/80 mt-0.5">
                  First two are highlighted — open your camera, read the hook, hit record.
                </div>
              </div>
            </div>
            {winnerCount > 0 && (
              <button
                type="button"
                onClick={handleMakeWinners}
                disabled={loading}
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-amber-300 to-amber-400 text-black px-3 py-1.5 text-xs font-semibold hover:from-amber-200 hover:to-amber-300 shadow shadow-amber-500/25 disabled:opacity-60"
                title="Generate 10 more clips in the same angle as your winner"
              >
                <Trophy className="w-3.5 h-3.5" />
                Make 10 more like winner{winnerCount > 1 ? 's' : ''}
              </button>
            )}
          </div>

          {/* Per-day momentum counter */}
          <MomentumCounter today={momentum.today} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {clips.map((clip, idx) => {
              const st = momentum.clips[clip.id];
              return (
                <div
                  key={clip.id}
                  className="animate-ff-fade-in"
                  style={{ animationDelay: `${Math.min(idx * 60, 600)}ms` }}
                >
                  <ClipCard
                    clip={clip}
                    index={idx + 1}
                    filmNext={idx < 2}
                    regenerating={regeneratingId === clip.id}
                    makingMore={makingMoreId === clip.id}
                    copied={copiedId === clip.id}
                    status={st}
                    onCopy={() => handleCopy(clip)}
                    onRegenerate={() => handleRegenerate(clip)}
                    onMakeMore={() => handleMakeMoreLike(clip)}
                    onMarkFilmed={() => handleMarkFilmed(clip)}
                    onMarkPosted={() => handleMarkPosted(clip)}
                    onSetViews={(bucket) => handleSetViews(clip, bucket)}
                  />
                </div>
              );
            })}
          </div>

          {/* Post-gen usage line — subtle footer */}
          {usageCopy && (
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 border-t border-white/5 pt-3">
              <span className={usageCopy.pct >= 80 ? 'text-amber-300' : ''}>{usageCopy.line}</span>
              {isFree && (
                <button
                  type="button"
                  onClick={() => setUpgradeModal({ reason: 'daily_cap' })}
                  className="text-amber-400 hover:text-amber-300 no-underline inline-flex items-center gap-1"
                >
                  Unlock bigger batches <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Upgrade modal */}
      {upgradeModal && (
        <UpgradeModal
          tier={tier}
          limitMessage={upgradeModal.message}
          onClose={() => setUpgradeModal(null)}
        />
      )}
    </div>
  );
}

function GenerationProgress({ batchSize }: { batchSize: number }) {
  const steps = [
    'Reading your input',
    `Drafting ${batchSize} angles`,
    'Writing hooks',
    'Polishing captions',
  ];
  const [stepIndex, setStepIndex] = useState(0);
  const [pct, setPct] = useState(6);

  useEffect(() => {
    const iv = setInterval(() => {
      setStepIndex(i => Math.min(i + 1, steps.length - 1));
    }, 1400);
    return () => clearInterval(iv);
  }, [steps.length]);

  useEffect(() => {
    // ease toward 92%; completion snaps it to 100 when parent unmounts
    const iv = setInterval(() => {
      setPct(p => (p >= 92 ? 92 : p + Math.max(1, Math.round((92 - p) * 0.08))));
    }, 180);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-amber-100 font-medium">{steps[stepIndex]}…</span>
        <span className="text-amber-300/80 font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-amber-300 transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MomentumCounter({ today }: { today: DayStat }) {
  const { generated, filmed, posted } = today;
  if (generated === 0 && filmed === 0 && posted === 0) return null;
  const filmRatio = generated > 0 ? Math.min(100, Math.round((filmed / generated) * 100)) : 0;
  const postRatio = generated > 0 ? Math.min(100, Math.round((posted / generated) * 100)) : 0;
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-zinc-400 border-t border-white/5 pt-3">
      <div className="flex items-center gap-3">
        <span className="text-zinc-300">
          <span className="text-amber-300 font-semibold">{generated}</span> generated today
        </span>
        <span className="text-zinc-600">·</span>
        <span>
          <Video className="inline w-3 h-3 -mt-0.5 mr-0.5" />
          <span className="text-zinc-200 font-semibold">{filmed}</span> filmed
        </span>
        <span className="text-zinc-600">·</span>
        <span>
          <Send className="inline w-3 h-3 -mt-0.5 mr-0.5" />
          <span className="text-zinc-200 font-semibold">{posted}</span> posted
          {generated > 0 && <span className="text-zinc-500"> ({postRatio}%)</span>}
        </span>
      </div>
      {generated > 0 && (
        <div className="hidden sm:flex items-center gap-1.5" title={`${filmRatio}% filmed · ${postRatio}% posted`}>
          <div className="h-1.5 w-24 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-emerald-400/70" style={{ width: `${postRatio}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ClipCard({
  clip, index, filmNext, regenerating, makingMore, copied,
  status, onCopy, onRegenerate, onMakeMore,
  onMarkFilmed, onMarkPosted, onSetViews,
}: {
  clip: Clip;
  index: number;
  filmNext?: boolean;
  regenerating: boolean;
  makingMore: boolean;
  copied: boolean;
  status?: ClipStatus;
  onCopy: () => void;
  onRegenerate: () => void;
  onMakeMore: () => void;
  onMarkFilmed: () => void;
  onMarkPosted: () => void;
  onSetViews: (bucket: ViewsBucket) => void;
}) {
  const filmed = status?.filmed === true;
  const posted = status?.posted === true;
  const views = status?.views;
  return (
    <article className={`
      group rounded-xl border overflow-hidden transition-colors
      ${filmNext
        ? 'border-amber-400/40 bg-zinc-950/80 shadow-lg shadow-amber-500/10 hover:border-amber-400/60'
        : 'border-white/10 bg-zinc-950/70 hover:border-white/20'}
    `}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="text-zinc-300 font-medium">Clip #{String(index).padStart(2, '0')}</span>
          {filmNext ? (
            <>
              <span className="text-zinc-600">·</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 text-amber-200 border border-amber-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold">
                <Flame className="w-3 h-3" /> Film next
              </span>
            </>
          ) : (
            <>
              <span className="text-zinc-600">·</span>
              <span className="text-emerald-400/90 uppercase tracking-wider text-[10px]">Ready to record</span>
            </>
          )}
          {clip.angle && (
            <span className="truncate rounded-md bg-white/5 text-zinc-400 border border-white/10 px-1.5 py-0.5 ml-1">
              {clip.angle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            title="Rewrite this clip"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5 disabled:opacity-50"
          >
            {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onCopy}
            title="Copy this clip"
            className={`
              inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-all
              ${copied
                ? 'text-emerald-400 bg-emerald-500/10 scale-105'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5 active:scale-95'}
            `}
          >
            {copied ? (
              <>
                <CheckCheck className="w-4 h-4" />
                <span className="text-[11px] hidden sm:inline font-medium">Copied</span>
              </>
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Hook — hero, dominant */}
      <div className="px-5 pt-5 pb-5 border-l-2 border-amber-400/60 bg-amber-400/[0.025] space-y-5">
        {/* The verbal hook is the headline — no label needed */}
        <p className="text-[20px] md:text-[22px] leading-[1.25] font-semibold text-zinc-50 tracking-tight">
          {clip.hook?.verbal || '—'}
        </p>

        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1.5">What to show</div>
            <p className="text-[14px] leading-relaxed text-zinc-300">{clip.hook?.visual || '—'}</p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1.5">Text on screen</div>
            <div className="text-sky-100 text-[14px] leading-snug font-medium bg-sky-500/[0.07] border border-sky-500/20 rounded-md px-2.5 py-1.5">
              {clip.hook?.text || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Body fields */}
      <div className="px-5 pt-5 pb-4 space-y-4">
        <Field label="Script" value={clip.script} body="text-zinc-200 text-[14px] leading-relaxed" />
        <Field label="Caption" value={clip.description} body="text-zinc-300 text-[13px] leading-relaxed" />
        <Field label="CTA" value={clip.cta} body="text-fuchsia-100 text-[14.5px] font-semibold leading-snug" />
      </div>

      <HowToFilm clip={clip} />

      {/* Action row — Filmed / Posted */}
      <div className="px-4 py-2.5 border-t border-white/5 bg-white/[0.015] flex items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={onMarkFilmed}
          title={filmed ? 'Mark as not filmed' : 'Mark this clip as filmed'}
          className={`
            inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors
            ${filmed
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
              : 'border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-zinc-100'}
          `}
        >
          {filmed ? <CheckCheck className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
          {filmed ? 'Filmed' : 'Mark as Filmed'}
        </button>
        <button
          type="button"
          onClick={onMarkPosted}
          title={posted ? 'Mark as not posted' : 'Mark this clip as posted'}
          className={`
            inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors
            ${posted
              ? 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100'
              : 'border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-zinc-100'}
          `}
        >
          {posted ? <CheckCheck className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          {posted ? 'Posted' : 'Mark as Posted'}
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onMakeMore}
            disabled={makingMore}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-transparent hover:bg-white/5 hover:border-white/20 px-2.5 py-1 text-[11.5px] text-zinc-300 disabled:opacity-60"
          >
            {makingMore ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> writing 5 more…</>
            ) : (
              <><Plus className="w-3 h-3" /> 5 more like this</>
            )}
          </button>
        </div>
      </div>

      {/* Views feedback row — only after posted */}
      {posted && (
        <div className="px-4 py-2.5 border-t border-white/5 bg-fuchsia-500/[0.03]">
          {views ? (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-fuchsia-200">
                <TrendingUp className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
                {VIEWS_LABEL[views]} views
              </span>
              <button
                type="button"
                onClick={() => onSetViews(views)}
                className="text-[11px] text-zinc-500 hover:text-zinc-300"
                title="Change"
              >
                change
              </button>
            </div>
          ) : (
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="text-[11.5px] text-fuchsia-200/90 mr-1">Did this get views yet?</span>
              {(Object.keys(VIEWS_LABEL) as ViewsBucket[]).map(bucket => (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => onSetViews(bucket)}
                  className="rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/10 hover:border-white/20 px-2 py-0.5 text-[11.5px] text-zinc-200"
                >
                  {VIEWS_LABEL[bucket]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Field({
  label, value, body,
}: {
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1.5">{label}</div>
      <div className={body}>{value || '—'}</div>
    </div>
  );
}

function HowToFilm({ clip }: { clip: Clip }) {
  const { shotType, framing, textLayout, thumbnailIdea, brollHint } = clip;
  // If the entire filming block is empty, don't render anything (older clip sets).
  if (!shotType && !framing && !textLayout && !thumbnailIdea && !brollHint) return null;

  const overlay = clip.hook?.text || '';
  const cta = clip.cta || '';

  return (
    <section className="px-5 py-4 border-t border-white/5 bg-gradient-to-b from-white/[0.015] to-transparent">
      <div className="flex items-center gap-1.5 mb-3">
        <Clapperboard className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400 font-semibold">
          How to film it
        </span>
      </div>

      <div className="flex gap-4 items-start">
        {/* Mini 9:16 thumbnail preview */}
        <div className="relative w-[76px] h-[135px] rounded-lg border border-white/15 bg-gradient-to-b from-zinc-800 to-zinc-900 overflow-hidden flex-shrink-0 shadow-inner">
          {/* Top text overlay (hook text on screen) */}
          {overlay && (
            <div className="absolute top-1.5 left-1 right-1">
              <div className="text-[7.5px] font-bold leading-[1.15] text-white text-center px-1 py-0.5 rounded bg-black/50 line-clamp-3">
                {overlay}
              </div>
            </div>
          )}
          {/* Center silhouette cue */}
          <div className="absolute inset-0 flex items-end justify-center pb-6">
            <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-end justify-center">
              <User className="w-5 h-5 text-white/40 mb-0.5" />
            </div>
          </div>
          {/* Bottom CTA mock */}
          {cta && (
            <div className="absolute bottom-1 left-1 right-1">
              <div className="text-[7px] leading-tight text-white/90 text-center bg-amber-500/80 rounded px-1 py-0.5 truncate">
                {cta.length > 34 ? cta.slice(0, 32) + '…' : cta}
              </div>
            </div>
          )}
          {/* Corner "9:16" label */}
          <div className="absolute top-0.5 right-0.5 text-[6px] text-white/30 font-mono">9:16</div>
        </div>

        {/* Rows */}
        <div className="flex-1 min-w-0 space-y-2">
          <FilmRow icon={Camera} label="Shot" value={shotType} />
          <FilmRow icon={User} label="Framing" value={framing} />
          <FilmRow icon={Type} label="Text layout" value={textLayout} />
          <FilmRow icon={ImageIcon} label="Thumbnail" value={thumbnailIdea} />
          {brollHint && <FilmRow icon={Film} label="B-roll" value={brollHint} />}
        </div>
      </div>
    </section>
  );
}

function FilmRow({
  icon: Icon, label, value,
}: {
  icon: typeof Camera;
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-[12.5px] leading-snug">
      <Icon className="w-3.5 h-3.5 text-zinc-500 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <span className="text-zinc-500 text-[10px] uppercase tracking-[0.12em] mr-1.5">{label}</span>
        <span className="text-zinc-200">{value}</span>
      </div>
    </div>
  );
}

function UpgradeModal({
  tier, limitMessage, onClose,
}: {
  tier: V1Tier;
  limitMessage?: string;
  onClose: () => void;
}) {
  const benefits: Array<{ tier: string; price: string; bullets: string[]; highlight?: boolean }> = [
    {
      tier: 'Creator',
      price: '$19/mo',
      bullets: ['50 clips/month', 'Batches up to 10', 'Save unlimited sets'],
    },
    {
      tier: 'Pro',
      price: '$49/mo',
      bullets: ['200 clips/month', 'Batches up to 20', 'Priority speed'],
      highlight: true,
    },
    {
      tier: 'Scale',
      price: '$99/mo',
      bullets: ['500+ clips/month', 'Fastest queue', 'Multi-brand support (soon)'],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="max-w-xl w-full rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 md:p-7 space-y-5 shadow-2xl shadow-black"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-400/15 border border-amber-400/30">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">You're getting traction</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-zinc-300">
          Creators who post 10–20 clips/day grow faster. Unlock batch generation and scale output.
        </p>

        {limitMessage && (
          <div className="text-xs text-zinc-500 border-l-2 border-white/10 pl-3">{limitMessage}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {benefits.map(b => (
            <div
              key={b.tier}
              className={`
                rounded-xl border p-3.5 space-y-2
                ${b.highlight
                  ? 'border-amber-400/40 bg-amber-400/5'
                  : 'border-white/10 bg-white/[0.03]'}
              `}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-sm font-semibold">{b.tier}</div>
                <div className="text-xs text-zinc-400">{b.price}</div>
              </div>
              <ul className="space-y-1">
                {b.bullets.map(x => (
                  <li key={x} className="flex items-start gap-1.5 text-[12px] text-zinc-300">
                    <span className="text-amber-400 mt-[1px]">✓</span>
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[11px] text-zinc-500">Current plan: {V1_LIMITS[tier].label}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 text-zinc-300">
              Later
            </button>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-amber-300 to-amber-400 hover:from-amber-200 hover:to-amber-300 text-black px-4 py-2 text-xs font-semibold no-underline shadow-lg shadow-amber-500/25"
            >
              Upgrade & Generate More <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatClip(c: Clip) {
  return [
    `HOOK`,
    `What to say:     ${c.hook?.verbal ?? ''}`,
    `What to show:    ${c.hook?.visual ?? ''}`,
    `Text on screen:  ${c.hook?.text ?? ''}`,
    ``,
    `SCRIPT:   ${c.script}`,
    `CAPTION:  ${c.description}`,
    `CTA:      ${c.cta}`,
  ].join('\n');
}
