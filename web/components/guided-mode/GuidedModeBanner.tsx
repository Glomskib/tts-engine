'use client';

import { useGuidedMode } from '@/contexts/GuidedModeContext';
import { GUIDED_STEPS, TOTAL_STEPS } from '@/lib/guided-mode/steps';
import { useRouter, usePathname } from 'next/navigation';
import { X, ArrowRight } from 'lucide-react';

export function GuidedModeBanner() {
  const { state, exit } = useGuidedMode();
  const router = useRouter();
  const pathname = usePathname();

  if (!state.active) return null;

  const stepDef = GUIDED_STEPS.find(s => s.step === state.step);
  // Use exact segment match to avoid false positives when the ID appears as a substring
  const isOnContentItem =
    !!state.contentItemId &&
    (pathname === `/admin/content-items/${state.contentItemId}` ||
      pathname.startsWith(`/admin/content-items/${state.contentItemId}/`));

  function handleExit() {
    if (confirm('Exit guided mode? You can restart it from the dashboard anytime.')) {
      exit();
    }
  }

  return (
    <div className="bg-teal-950/95 border-b border-teal-500/30">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Step badge */}
        <span className="flex-shrink-0 text-[11px] font-bold text-teal-200 bg-teal-800/60 px-2.5 py-1 rounded-full whitespace-nowrap">
          Step {state.step} / {TOTAL_STEPS}
        </span>

        {/* Progress bar dots */}
        <div className="flex gap-1 flex-shrink-0">
          {GUIDED_STEPS.map(s => (
            <div
              key={s.step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s.step < state.step
                  ? 'w-4 bg-teal-400'
                  : s.step === state.step
                  ? 'w-6 bg-white'
                  : 'w-1.5 bg-teal-800/80'
              }`}
            />
          ))}
        </div>

        {/* Step description */}
        <p className="flex-1 text-xs text-teal-100 truncate min-w-0">
          <span className="font-semibold">{stepDef?.title}:</span>{' '}
          {stepDef?.instruction}
        </p>

        {/* Back-to-item button (shown when off the content item page) */}
        {state.contentItemId && !isOnContentItem && state.step >= 2 && (
          <button
            onClick={() =>
              router.push(`/admin/content-items/${state.contentItemId}`)
            }
            className="flex-shrink-0 flex items-center gap-1.5 text-xs text-teal-100 hover:text-white bg-teal-800/50 hover:bg-teal-700/60 border border-teal-600/30 px-2.5 py-1 rounded-lg transition"
          >
            Continue <ArrowRight size={11} />
          </button>
        )}

        {/* Exit */}
        <button
          onClick={handleExit}
          className="flex-shrink-0 p-1.5 text-teal-500 hover:text-teal-200 hover:bg-teal-800/50 rounded transition"
          title="Exit guided mode"
          aria-label="Exit guided mode"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
