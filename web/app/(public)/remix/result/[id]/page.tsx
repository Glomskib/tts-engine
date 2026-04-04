'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Loader2,
  Zap,
  Copy,
  Check,
  Play,
  Eye,
  Film,
  FileText,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Share2,
} from 'lucide-react';
import { events } from '@/lib/tracking';

// ── Types (same as remix page) ──

interface RemixScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  full_script: string;
  on_screen_text: string[];
  filming_notes: string;
  estimated_length: string;
  remix_notes: string;
}

interface PackHook {
  visual_hook: string;
  text_on_screen: string;
  verbal_hook: string;
  why_this_works: string;
  category: string;
}

interface PackVisualHook {
  action: string;
  shot_type: string;
  setup: string;
  pairs_with?: string;
  energy: string;
  why_it_works: string;
  strength?: number;
}

interface RemixSession {
  id: string;
  source_url: string;
  platform: string;
  original_hook: string;
  remix_script: RemixScript | null;
  hooks: PackHook[];
  visual_hooks: PackVisualHook[];
  context: {
    original_hook?: { line: string; style: string; strength: number };
    content?: { format: string; pacing: string; structure: string };
    what_works?: string[];
    emotional_triggers?: string[];
    duration?: number;
  };
  created_at: string;
}

// ── Helpers ──

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      {label || (copied ? 'Copied' : 'Copy')}
    </button>
  );
}

function ShareButton({ remixId }: { remixId: string }) {
  const [shared, setShared] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(window.location.href);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        events.remixShared(remixId);
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
    >
      {shared ? <Check size={14} className="text-green-400" /> : <Share2 size={14} />}
      {shared ? 'Link Copied' : 'Share'}
    </button>
  );
}

// ── Main Component ──

export default function RemixResultPage() {
  const params = useParams();
  const id = params.id as string;
  const [session, setSession] = useState<RemixSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/remix/session?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          setError('Remix not found.');
          return;
        }
        const json = await res.json();
        setSession(json.data);
        // Track remix_viewed client-side (server-side also fires in the session API)
        events.remixViewed(id);
      })
      .catch(() => setError('Failed to load remix.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-violet-400 mx-auto mb-4" />
          <p className="text-zinc-400">Loading remix...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-zinc-400 mb-4">{error || 'Remix not found.'}</p>
          <Link
            href="/remix"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold rounded-xl"
          >
            <RefreshCw size={16} />
            Remix Your Own Video
          </Link>
        </div>
      </div>
    );
  }

  const ctx = session.context;
  const hookAnalysis = ctx.original_hook;
  const content = ctx.content;
  const whatWorks = ctx.what_works || [];
  const emotionalTriggers = ctx.emotional_triggers || [];

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <section className="pt-12 pb-6 sm:pt-16 sm:pb-8">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">FlashFlow Remix</p>
              <p className="text-sm text-zinc-400">
                Created {new Date(session.created_at).toLocaleDateString()}
              </p>
            </div>
            <ShareButton remixId={id} />
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto px-6 space-y-8">

          {/* Hook Comparison Card */}
          {session.remix_script && hookAnalysis && (
            <div className="bg-zinc-900/50 border border-violet-500/20 rounded-xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Original Hook</span>
                  <p className="text-zinc-300 mt-2">&ldquo;{hookAnalysis.line}&rdquo;</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-zinc-500">{hookAnalysis.style}</span>
                    <span className="text-xs text-zinc-500">{hookAnalysis.strength}/10</span>
                  </div>
                </div>
                <div className="md:border-l md:border-white/5 md:pl-6">
                  <span className="text-xs text-violet-400 uppercase tracking-wider font-medium">Your Hook</span>
                  <p className="text-white font-medium mt-2">&ldquo;{session.remix_script.hook}&rdquo;</p>
                </div>
              </div>
              {session.remix_script.remix_notes && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <span className="text-xs text-zinc-500">How the remix changes the structure</span>
                  <p className="text-zinc-400 text-sm mt-1 italic">{session.remix_script.remix_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Original Video */}
          {content && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Play size={18} className="text-violet-400" />
                <h2 className="text-lg font-semibold text-white">Original Video</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-xs text-zinc-500">Format</span>
                  <p className="text-sm text-zinc-300">{content.format}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Pacing</span>
                  <p className="text-sm text-zinc-300">{content.pacing}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Structure</span>
                  <p className="text-sm text-zinc-300">{content.structure}</p>
                </div>
              </div>
              <a
                href={session.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 mt-3"
              >
                <ExternalLink size={14} />
                Watch original
              </a>
            </div>
          )}

          {/* Why It Works */}
          {whatWorks.length > 0 && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Eye size={18} className="text-amber-400" />
                <h2 className="text-lg font-semibold text-white">Why It Works</h2>
              </div>
              <ul className="space-y-2">
                {whatWorks.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Zap size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <span className="text-zinc-300 text-sm">{reason}</span>
                  </li>
                ))}
              </ul>
              {emotionalTriggers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <span className="text-xs text-zinc-500">Emotional triggers: </span>
                  <span className="text-xs text-zinc-400">{emotionalTriggers.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Remix Script */}
          {session.remix_script && (
            <div className="bg-zinc-900/50 border border-violet-500/20 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-violet-400" />
                  <h2 className="text-lg font-semibold text-white">Remix Script</h2>
                </div>
                <CopyButton text={session.remix_script.full_script} label="Copy Script" />
              </div>
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-violet-400 uppercase tracking-wider font-medium">Hook</span>
                  <p className="text-white font-medium mt-1">&ldquo;{session.remix_script.hook}&rdquo;</p>
                </div>
                {session.remix_script.setup && (
                  <div>
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Setup</span>
                    <p className="text-zinc-300 text-sm mt-1">{session.remix_script.setup}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Body</span>
                  <p className="text-zinc-300 text-sm mt-1">{session.remix_script.body}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">CTA</span>
                  <p className="text-zinc-300 text-sm mt-1">{session.remix_script.cta}</p>
                </div>
                {session.remix_script.on_screen_text.length > 0 && (
                  <div className="pt-2 border-t border-white/5">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">On-Screen Text</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {session.remix_script.on_screen_text.map((t, i) => (
                        <span key={i} className="px-2 py-1 text-xs bg-zinc-800 text-zinc-300 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {session.remix_script.filming_notes && (
                  <div className="pt-2 border-t border-white/5">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Filming Notes</span>
                    <p className="text-zinc-400 text-sm mt-1">{session.remix_script.filming_notes}</p>
                  </div>
                )}
                {session.remix_script.estimated_length && (
                  <span className="text-xs text-zinc-600">Est. {session.remix_script.estimated_length}</span>
                )}
              </div>
            </div>
          )}

          {/* Hooks */}
          {session.hooks.length > 0 && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={18} className="text-teal-400" />
                <h2 className="text-lg font-semibold text-white">Hooks</h2>
              </div>
              <div className="space-y-4">
                {session.hooks.map((hook, i) => (
                  <div key={i} className="p-4 bg-zinc-800/50 rounded-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <div>
                          <span className="text-xs text-teal-400 font-medium">Verbal Hook</span>
                          <p className="text-white text-sm mt-0.5">&ldquo;{hook.verbal_hook}&rdquo;</p>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500">Visual</span>
                          <p className="text-zinc-400 text-sm mt-0.5">{hook.visual_hook}</p>
                        </div>
                        <div>
                          <span className="text-xs text-zinc-500">Text on Screen</span>
                          <p className="text-zinc-400 text-sm mt-0.5">{hook.text_on_screen}</p>
                        </div>
                        {hook.why_this_works && (
                          <p className="text-xs text-zinc-500 italic mt-1">{hook.why_this_works}</p>
                        )}
                      </div>
                      <CopyButton text={hook.verbal_hook} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visual Ideas */}
          {session.visual_hooks.length > 0 && (
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Film size={18} className="text-fuchsia-400" />
                <h2 className="text-lg font-semibold text-white">Visual Ideas</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {session.visual_hooks.map((vh, i) => (
                  <div key={i} className="p-4 bg-zinc-800/50 rounded-lg space-y-2">
                    <p className="text-white text-sm font-medium">{vh.action}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{vh.shot_type}</span>
                      <span>&middot;</span>
                      <span>{vh.energy}</span>
                    </div>
                    {vh.setup && <p className="text-zinc-400 text-xs">Setup: {vh.setup}</p>}
                    {vh.why_it_works && <p className="text-zinc-500 text-xs italic">{vh.why_it_works}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="text-center py-8">
            <Link
              href="/remix"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-semibold rounded-xl transition-all text-lg"
            >
              <RefreshCw size={18} />
              Remix Your Own Video
            </Link>
            <p className="text-zinc-500 text-sm mt-3">
              Paste any TikTok or YouTube link and get your own version in seconds.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
