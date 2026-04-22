'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Copy, CheckCheck, Loader2, Trash2, BookmarkCheck, Sparkles,
  Flame, ChevronDown,
} from 'lucide-react';
import type { Clip } from '@/lib/v1/clip-generation';

interface ClipSet {
  id: string;
  title: string;
  input_mode: string;
  input_value: string;
  niche: string | null;
  tone: string | null;
  clips: Clip[];
  created_at: string;
}

const MODE_LABEL: Record<string, string> = {
  product: 'Product',
  tiktok_url: 'TikTok',
  niche: 'Niche',
};

const TONE_LABEL: Record<string, string> = {
  bought_because: 'I bought this because…',
  unexpected: "I didn't expect this to work",
  doing_wrong: 'I was doing this wrong',
  replaced: 'This replaced my old setup',
  tested: 'I tested this for a week',
  if_youre: "If you're ___, this is for you",
  pov: 'POV / scenario',
  dont_buy: "Don't buy this unless…",
  why_switching: 'Why people are switching to this',
  skeptical: 'I was skeptical until…',
  ugc: 'UGC',
  story: 'Story',
  problem_solution: 'Problem/Solution',
  viral_remix: 'Viral Remix',
};

export default function LibraryPage() {
  const [sets, setSets] = useState<ClipSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/clips/sets');
      const data = await res.json();
      if (res.ok && Array.isArray(data.sets)) setSets(data.sets);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this clip set? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clips/sets/${id}`, { method: 'DELETE' });
      if (res.ok) setSets(prev => prev.filter(s => s.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 py-24 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading library…
      </div>
    );
  }

  if (sets.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight">Library</h1>
          <p className="text-zinc-400 mt-1.5 text-sm">Saved clip sets will live here.</p>
        </div>
        <div className="rounded-2xl border border-dashed border-white/15 bg-zinc-950/50 p-10 md:p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
            <BookmarkCheck className="w-5 h-5 text-amber-300" />
          </div>
          <h2 className="text-lg font-semibold mb-1">No saved sets yet</h2>
          <p className="text-sm text-zinc-400 mb-5 max-w-sm mx-auto">
            Generate a batch on Create, then tap <span className="text-zinc-200">Save to library</span> to keep it.
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-amber-300 to-amber-400 text-black px-4 py-2.5 text-sm font-semibold no-underline hover:from-amber-200 hover:to-amber-300 shadow-lg shadow-amber-500/20"
          >
            <Sparkles className="w-4 h-4" /> Create your first batch
          </Link>
        </div>
      </div>
    );
  }

  const totalClips = sets.reduce((sum, s) => sum + (s.clips?.length ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight">Library</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            {sets.length} {sets.length === 1 ? 'set' : 'sets'} · {totalClips} clips total
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-sm text-zinc-200 no-underline"
        >
          <Sparkles className="w-3.5 h-3.5" /> New batch
        </Link>
      </div>

      <div className="space-y-2.5">
        {sets.map(set => {
          const open = openId === set.id;
          const modeLabel = MODE_LABEL[set.input_mode] ?? set.input_mode;
          const toneLabel = set.tone ? TONE_LABEL[set.tone] ?? set.tone : null;
          return (
            <div
              key={set.id}
              className="rounded-xl border border-white/10 bg-zinc-950/70 overflow-hidden transition-colors hover:border-white/15"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : set.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-zinc-50">{set.title}</div>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-zinc-500 mt-1">
                    <span>{set.clips.length} clips</span>
                    <span className="opacity-40">·</span>
                    <span className="uppercase tracking-wider text-[10px] rounded bg-white/5 border border-white/10 px-1.5 py-0.5">
                      {modeLabel}
                    </span>
                    {toneLabel && (
                      <>
                        <span className="opacity-40">·</span>
                        <span>{toneLabel}</span>
                      </>
                    )}
                    <span className="opacity-40">·</span>
                    <span>{new Date(set.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 ml-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const text = set.clips.map((c, i) => `━━━ CLIP ${i + 1} ━━━\n${formatClipText(c)}`).join('\n\n');
                      copyText(`set-${set.id}`, text);
                    }}
                    className={`
                      p-1.5 rounded-md transition-colors
                      ${copiedKey === `set-${set.id}` ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'}
                    `}
                    title="Copy all clips"
                  >
                    {copiedKey === `set-${set.id}` ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(set.id); }}
                    disabled={deletingId === set.id}
                    className="p-1.5 rounded-md text-zinc-500 hover:text-red-300 hover:bg-white/5 disabled:opacity-50"
                    title="Delete set"
                  >
                    {deletingId === set.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {open && (
                <div className="border-t border-white/5 p-4 space-y-3 bg-black/30">
                  {set.clips.map((clip, i) => (
                    <div
                      key={clip.id || i}
                      className="rounded-lg border border-white/5 bg-zinc-950/80 overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500 font-mono">#{String(i + 1).padStart(2, '0')}</span>
                          {clip.angle && (
                            <span className="rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20 px-1.5 py-0.5">
                              {clip.angle}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => copyText(`clip-${set.id}-${i}`, formatClipText(clip))}
                          className={`
                            p-1 rounded-md transition-colors
                            ${copiedKey === `clip-${set.id}-${i}` ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'}
                          `}
                        >
                          {copiedKey === `clip-${set.id}-${i}` ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="px-4 pt-4 pb-3 border-l-2 border-amber-400/60 bg-amber-400/[0.025] space-y-3">
                        <div className="flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-[11px] uppercase tracking-[0.14em] text-amber-300/90 font-semibold">Hook</span>
                        </div>
                        <Row label="What to say" value={clip.hook?.verbal} body="text-zinc-50 font-semibold text-[16px] leading-snug" />
                        <Row label="What to show" value={clip.hook?.visual} body="text-zinc-300 text-[13px] leading-relaxed" />
                        <Row label="Text on screen" value={clip.hook?.text} body="text-sky-100 text-[13.5px] font-medium bg-sky-500/[0.07] border border-sky-500/20 rounded-md px-2.5 py-1.5" />
                      </div>

                      <div className="px-4 pb-4 pt-3 space-y-3">
                        <Row label="Script" value={clip.script} body="text-zinc-200 text-[13.5px] leading-relaxed" />
                        <Row label="Caption" value={clip.description} body="text-zinc-300 text-[12.5px] leading-relaxed" />
                        <Row label="CTA" value={clip.cta} body="text-fuchsia-100 text-[13.5px] font-semibold leading-snug" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  label, value, body,
}: {
  label: string;
  value: string | null | undefined;
  body: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1">{label}</div>
      <div className={body}>{value || '—'}</div>
    </div>
  );
}

function formatClipText(c: Clip) {
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
