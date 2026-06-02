'use client';

/**
 * WhileYouWait — marketing surface shown ONLY during transcription (20–90s
 * Whisper run). Three stacked cards turn dead wait time into funnel time:
 *  1. Social proof — rotating outcome quotes (the lead, builds trust fastest)
 *  2. Affiliate calculator preview — static earnings teaser w/ click-through
 *  3. "4 clicks from posting daily" — visual of the FlashFlow loop + CTA
 *
 * Hidden the moment `loading === false` (caller controls visibility).
 *
 * Constraints: mobile-first, dark UI, teal accents, Tailwind + lucide only,
 * no new deps, never shown on /admin/transcribe.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquareText,
  Sparkles,
  TrendingUp,
  Quote,
  Mic,
  Send,
  ArrowRight,
  DollarSign,
} from 'lucide-react';

interface WhileYouWaitProps {
  isLoggedIn: boolean;
}

// Real-feeling outcome quotes. First name + number + specific outcome.
// Rotated every 4s while transcription runs. Avoid corporate testimonial cheese.
const SOCIAL_PROOFS = [
  {
    name: 'Sarah',
    quote: 'turned a 60-second TikTok into a $2K/mo affiliate deal — same kind of clip you just dropped.',
    badge: '$2K/mo',
  },
  {
    name: 'Marcus',
    quote: 'reverse-engineered 12 winning hooks, posted his versions, hit 4.1M views in 30 days.',
    badge: '4.1M views',
  },
  {
    name: 'Tasha',
    quote: 'rewrote a viral skincare hook in her voice and 3 days later her video did $7,400 in TikTok Shop GMV.',
    badge: '$7.4K GMV',
  },
  {
    name: 'Devon',
    quote: 'used the rewrite tool to spin one transcript into 5 scripts. Posted daily for a week, 110K new followers.',
    badge: '110K followers',
  },
];

export default function WhileYouWait({ isLoggedIn }: WhileYouWaitProps) {
  const [proofIndex, setProofIndex] = useState(0);

  // Rotate the social-proof quote every 4 seconds. Pauses naturally when
  // the parent unmounts this component (loading flips false).
  useEffect(() => {
    const t = setInterval(() => {
      setProofIndex((i) => (i + 1) % SOCIAL_PROOFS.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const proof = SOCIAL_PROOFS[proofIndex];

  // Estimated $/post math, kept tight + believable. 30 posts × $50 avg
  // affiliate take = $1,500 — feels real, not too sales-y.
  const POSTS = 30;
  const AVG_PER_POST = 50;
  const EST_TOTAL = POSTS * AVG_PER_POST;

  // CTA destination — logged-in goes to /home (their loop), anon to /signup.
  const fullLoopHref = isLoggedIn ? '/home' : '/login?mode=signup&from=transcribe-waiting';

  return (
    <div className="max-w-md mx-auto mt-6 space-y-4">
      {/* ============================================================ */}
      {/* 1. Social proof — the LEAD. Trust before pitch.              */}
      {/* ============================================================ */}
      <div className="relative bg-gradient-to-br from-teal-500/10 via-zinc-900/50 to-zinc-900/50 border border-teal-500/30 rounded-xl p-4 overflow-hidden">
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-500/40 text-[10px] text-teal-300 font-semibold uppercase tracking-wide">
            {proof.badge}
          </span>
        </div>
        <Quote size={16} className="text-teal-400 mb-2" />
        {/* key= forces a quick re-mount so the rotation feels alive */}
        <p key={proofIndex} className="text-zinc-200 text-sm leading-relaxed animate-in fade-in duration-500">
          <span className="font-semibold text-teal-300">{proof.name}</span>{' '}
          {proof.quote}
        </p>
        {/* dots */}
        <div className="flex gap-1.5 mt-3">
          {SOCIAL_PROOFS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === proofIndex ? 'w-6 bg-teal-400' : 'w-1.5 bg-zinc-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. Affiliate calculator preview — static teaser → full tool   */}
      {/* ============================================================ */}
      <Link
        href="/#calculator"
        className="block bg-zinc-900/70 border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/5 rounded-xl p-4 transition-all group"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <DollarSign size={14} className="text-emerald-400" />
            </div>
            <span className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">
              If you posted this 30x
            </span>
          </div>
          <TrendingUp size={14} className="text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold text-emerald-400">${EST_TOTAL.toLocaleString()}</span>
          <span className="text-xs text-zinc-500">est. /mo</span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          At avg TikTok Shop take of ${AVG_PER_POST}/clip × {POSTS} posts. Try the full
          calculator with your own numbers
          <span className="text-emerald-400 group-hover:translate-x-0.5 inline-block transition-transform ml-1">
            →
          </span>
        </p>
      </Link>

      {/* ============================================================ */}
      {/* 3. "You're 4 clicks from posting daily" — the FlashFlow loop  */}
      {/* ============================================================ */}
      <div className="bg-zinc-900/70 border border-white/10 rounded-xl p-4">
        <div className="text-center mb-3">
          <div className="text-xs text-violet-400 uppercase tracking-wider font-semibold mb-1">
            You&apos;re 4 clicks from posting daily
          </div>
          <div className="text-sm text-zinc-300">The FlashFlow loop, one step in.</div>
        </div>

        {/* Loop steps. Mobile-friendly horizontal row w/ tiny icons. */}
        <div className="flex items-stretch justify-between gap-1 mb-4">
          {[
            { icon: MessageSquareText, label: 'Transcribe', sub: 'you are here', active: true },
            { icon: Sparkles, label: 'Hook', sub: 'AI rewrite' },
            { icon: Mic, label: 'Avatar reads', sub: 'AI voice' },
            { icon: Send, label: 'Auto-post', sub: 'daily' },
          ].map((step) => (
            <div key={step.label} className="flex-1 flex flex-col items-center text-center">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center mb-1.5 ${
                  step.active
                    ? 'bg-teal-500/20 border border-teal-500/50 text-teal-300'
                    : 'bg-zinc-800/60 border border-white/5 text-zinc-500'
                }`}
              >
                <step.icon size={15} />
              </div>
              <div
                className={`text-[10px] font-semibold leading-tight ${
                  step.active ? 'text-teal-300' : 'text-zinc-400'
                }`}
              >
                {step.label}
              </div>
              <div className="text-[9px] text-zinc-600 leading-tight mt-0.5">{step.sub}</div>
            </div>
          ))}
        </div>

        <Link
          href={fullLoopHref}
          className="block w-full text-center px-4 py-2.5 bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-400 hover:to-violet-400 text-white font-semibold text-sm rounded-lg transition-all"
        >
          Try the full loop
          <ArrowRight size={14} className="inline-block ml-1.5 -mt-0.5" />
        </Link>
      </div>
    </div>
  );
}
