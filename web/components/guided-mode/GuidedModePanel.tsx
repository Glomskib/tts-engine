'use client';

import { useGuidedMode } from '@/contexts/GuidedModeContext';
import { GUIDED_STEPS, TOTAL_STEPS } from '@/lib/guided-mode/steps';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  Lightbulb,
  Video,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import type { StepConditionInput } from '@/lib/guided-mode/types';

interface GuidedModePanelProps {
  item: {
    id: string;
    script_text?: string | null;
    raw_video_url?: string | null;
    transcript_status?: string | null;
    edit_plan_json?: unknown | null;
    edit_status?: string | null;
    rendered_video_url?: string | null;
  };
  onAnalyze: () => Promise<void>;
  onGeneratePlan: () => Promise<void>;
  onRender: () => Promise<void>;
  editingBusy: string | null;
}

export function GuidedModePanel({
  item,
  onAnalyze,
  onGeneratePlan,
  onRender,
  editingBusy,
}: GuidedModePanelProps) {
  const { state, advance, acknowledgeRecording, recordingAcknowledged } =
    useGuidedMode();

  if (!state.active) return null;

  const stepDef = GUIDED_STEPS.find(s => s.step === state.step);
  if (!stepDef) return null;

  const conditionInput: StepConditionInput = { item, recordingAcknowledged };
  const isComplete = stepDef.isComplete(conditionInput);
  const reason = stepDef.notCompleteReason(conditionInput);

  // Steps that have CTAs on this (content item) page
  const actionsOnThisPage: Record<number, () => void | Promise<void>> = {
    3: () => { acknowledgeRecording(); advance(); },
    5: () => onAnalyze(),
    6: () => onGeneratePlan(),
    7: () => onRender(),
  };

  const isActionableHere = state.step in actionsOnThisPage;

  function ctaDisabled(): boolean {
    if (!!editingBusy) return true;
    // Step 5 (Analyze): needs a raw video to transcribe
    if (state.step === 5 && !item.raw_video_url) return true;
    // Step 6 (Generate Plan): needs transcript to be completed (not just video uploaded)
    if (state.step === 6 && item.transcript_status !== 'completed') return true;
    // Step 7 (Render): needs a valid edit plan
    if (state.step === 7 && !item.edit_plan_json) return true;
    return false;
  }

  function ctaBlockedReason(): string | null {
    if (state.step === 5 && !item.raw_video_url) return 'Upload a raw video first (Step 4).';
    if (state.step === 6 && item.transcript_status !== 'completed') {
      if (item.transcript_status === 'processing') return 'Analysis is still running — wait for it to finish.';
      if (item.transcript_status === 'failed') return 'Analysis failed. Retry Step 5 before planning.';
      return 'Run Step 5 (Analyze) before generating an edit plan.';
    }
    if (state.step === 7 && !item.edit_plan_json) return 'Generate an edit plan first (Step 6).';
    return null;
  }

  async function handleCta() {
    const fn = actionsOnThisPage[state.step];
    if (fn) await fn();
  }

  return (
    <div className="rounded-xl border-2 border-teal-500/40 bg-teal-950/30 overflow-hidden">
      {/* Panel header */}
      <div className="px-4 py-3 bg-teal-900/30 border-b border-teal-500/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 text-[11px] font-bold text-teal-200 bg-teal-800/70 px-2.5 py-0.5 rounded-full">
            Step {state.step} of {TOTAL_STEPS}
          </span>
          <span className="text-sm font-semibold text-teal-50 truncate">
            {stepDef.title}
          </span>
        </div>
        {isComplete && (
          <div className="flex items-center gap-1 text-emerald-400 text-xs flex-shrink-0">
            <CheckCircle2 size={13} />
            <span>Done</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Instruction */}
        <p className="text-sm text-zinc-200 leading-relaxed">{stepDef.instruction}</p>

        {/* Hint */}
        <div className="flex items-start gap-2">
          <Lightbulb size={12} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <p className="text-xs text-zinc-400">{stepDef.hint}</p>
        </div>

        {/* Blocking reason (when not complete) */}
        {!isComplete && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">{reason}</p>
          </div>
        )}

        {/* Step-specific panels */}

        {/* Step 2: link to script generator */}
        {state.step === 2 && !isComplete && (
          <Link
            href={`/admin/content-studio`}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm transition"
          >
            Open Script Generator <ArrowRight size={14} />
          </Link>
        )}

        {/* Step 3: recording tips + confirm */}
        {state.step === 3 && !isComplete && (
          <div className="space-y-3">
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                <Video size={12} className="text-teal-400" /> Recording Checklist
              </p>
              <ul className="space-y-1 text-xs text-zinc-400">
                <li>• Portrait orientation (9:16) — vertical video only</li>
                <li>• Good lighting — face a window or use a ring light</li>
                <li>• Clear audio — quiet room, close to mic</li>
                <li>• Follow your script, but stay natural</li>
                <li>• Aim for 30–90 seconds of footage</li>
              </ul>
            </div>
            <button
              onClick={() => { acknowledgeRecording(); advance(); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm transition"
            >
              <CheckCircle2 size={14} /> I've Recorded My Video
            </button>
          </div>
        )}

        {/* Steps 4–7: primary CTA */}
        {isActionableHere && state.step !== 3 && !isComplete && (
          <>
            {ctaBlockedReason() && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-red-400" />
                <p className="text-xs text-red-300">{ctaBlockedReason()}</p>
              </div>
            )}
            <button
              onClick={handleCta}
              disabled={ctaDisabled()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {editingBusy ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Working…
                </>
              ) : (
                stepDef.cta
              )}
            </button>
          </>
        )}

        {/* Advance button once step is complete (except step 7) */}
        {isComplete && state.step < 7 && (
          <button
            onClick={advance}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm transition"
          >
            <CheckCircle2 size={14} />
            Continue to Step {state.step + 1} →
          </button>
        )}

        {/* Final completion screen */}
        {isComplete && state.step === 7 && (
          <div className="rounded-xl bg-emerald-900/30 border border-emerald-500/30 p-5 text-center space-y-2">
            <p className="text-2xl">🎉</p>
            <p className="text-sm font-bold text-emerald-300">
              Full pipeline complete!
            </p>
            <p className="text-xs text-zinc-400">
              Your rendered video is ready. Download it and post it on TikTok.
            </p>
          </div>
        )}

        {/* Progress mini-checklist */}
        <div className="pt-1 border-t border-teal-500/10">
          <div className="flex items-center gap-1">
            {GUIDED_STEPS.map(s => {
              const done = s.isComplete(conditionInput);
              const active = s.step === state.step;
              return (
                <div
                  key={s.step}
                  className={`flex-1 flex flex-col items-center gap-0.5 ${
                    done
                      ? 'text-emerald-400'
                      : active
                      ? 'text-teal-300'
                      : 'text-zinc-700'
                  }`}
                  title={s.title}
                >
                  {done ? (
                    <CheckCircle2 size={12} />
                  ) : active ? (
                    <Circle size={12} className="fill-teal-900/60" />
                  ) : (
                    <Circle size={12} />
                  )}
                  <span className="text-[8px] font-mono">{s.step}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
