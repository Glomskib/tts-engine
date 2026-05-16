'use client';

// ============================================================
// CreateOnboarding — first-visit modal for /create.
//
// Shown once per browser via localStorage flag. Three short
// slides explaining the "drop a video → pick a vibe → ship"
// loop. Skip button always visible. Doesn't gate the page —
// dismissable any time.
//
// Why a modal instead of inline tooltips? Tooltips break on
// mobile and require pointer events. A center modal works on
// every viewport and respects the user's focus.
// ============================================================

import { useEffect, useState } from 'react';
import { Sparkles, Upload, Wand2, Rocket, X } from 'lucide-react';

const STORAGE_KEY = 'ff_seen_onboarding_v1';

const SLIDES = [
  {
    icon: Upload,
    title: 'Drop a video',
    body:
      'Upload, paste a link, or record from your camera. We accept anything — phone footage, livestream, podcast, talking-head.',
  },
  {
    icon: Wand2,
    title: 'Pick a vibe',
    body:
      'Hype, calm, real, funny, sad. We tune captions, music, and B-roll to match. You can override anything after.',
  },
  {
    icon: Rocket,
    title: 'Ship it',
    body:
      'A few minutes later, your clips land in /clips — TikTok-ready vertical, captions burned in, no watermarks. Yours to post.',
  },
];

export default function CreateOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Small delay so the page paints before the modal shows up.
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage blocked — silently skip onboarding
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  const slide = SLIDES[step];
  const Icon = slide.icon;
  const isLast = step === SLIDES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to FlashFlow"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            Quick start · {step + 1}/{SLIDES.length}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip"
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slide body */}
        <div className="px-6 py-8 text-center">
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className="absolute inset-0 bg-teal-500/20 rounded-2xl blur-xl" />
            <div className="relative w-16 h-16 mx-auto rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
              <Icon className="w-7 h-7 text-teal-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">{slide.title}</h2>
          <p className="text-zinc-400 leading-relaxed">{slide.body}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-white/5 bg-zinc-900/50">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i <= step ? 'bg-teal-400' : 'bg-zinc-700'
                }`}
              />
            ))}
          </div>
          <div className="flex-1" />
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
            className="px-5 py-2 text-sm rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold hover:from-teal-400 hover:to-emerald-400 transition-all shadow-lg shadow-teal-500/20"
          >
            {isLast ? "Let's go" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
