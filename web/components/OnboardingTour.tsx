'use client';

// ============================================================
// OnboardingTour — 3-step first-signup tour on /create.
//
// Trigger: rendered only when the user has zero jobs AND has not
// previously dismissed the tour (localStorage 'ff_onboarded'='1').
//
// Steps:
//   1. Pick a vibe — explain what the vibe selector does.
//   2. Upload or paste a link — show the source picker.
//   3. We do the rest — explain the auto-cooking promise.
//
// Each step is a centered modal with a "step N of 3" indicator
// and Next / Skip controls. Pure CSS overlay — no Floating-UI or
// tippy.js dependency.
// ============================================================

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ff_onboarded';

type Step = {
  title: string;
  body: string;
  cta: string;
};

const STEPS: Step[] = [
  {
    title: 'Pick a vibe',
    body:
      'Tell FlashFlow what energy you want — hype, calm, real, funny, sad. The vibe shapes captions, pacing, music, and the AI’s editing decisions. Switch any time.',
    cta: 'Got it',
  },
  {
    title: 'Drop a video',
    body:
      'Record on the spot, upload up to a few clips, or paste a YouTube or TikTok link. Long-form is welcome — we’ll find the moments worth keeping.',
    cta: 'Next',
  },
  {
    title: 'We do the rest',
    body:
      'You’ll see live progress as we tune in, find the heat, polish, and ship the final cut. Usually under a minute per clip. No watermarks. Yours to keep.',
    cta: 'Let’s go',
  },
];

export default function OnboardingTour({
  shouldShow,
  onDone,
}: {
  shouldShow: boolean;
  onDone?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShow) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY) === '1') return;
    // Tiny delay so the tour doesn't FOUC during page hydration.
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [shouldShow]);

  if (!visible) return null;

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
    onDone?.();
  };

  const advance = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      close();
    }
  };

  const s = STEPS[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ff-tour-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-6 sm:p-8">
        {/* Step pip indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-8 bg-teal-400' : 'w-1.5 bg-white/15'
              }`}
            />
          ))}
        </div>

        <div className="text-xs font-medium uppercase tracking-widest text-teal-400 text-center mb-2">
          Step {step + 1} of {STEPS.length}
        </div>
        <h2
          id="ff-tour-title"
          className="text-2xl sm:text-3xl font-bold text-zinc-100 text-center mb-3"
        >
          {s.title}
        </h2>
        <p className="text-zinc-400 text-center leading-relaxed mb-8">{s.body}</p>

        <div className="flex flex-col sm:flex-row-reverse gap-3">
          <button
            type="button"
            onClick={advance}
            className="w-full sm:flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white font-semibold transition-all shadow-lg shadow-teal-500/20"
          >
            {s.cta}
          </button>
          <button
            type="button"
            onClick={close}
            className="w-full sm:w-auto px-6 py-3 rounded-xl border border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}
