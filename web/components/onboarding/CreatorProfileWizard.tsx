'use client';

/**
 * CreatorProfileWizard — 4-step onboarding wizard for creator profile.
 *
 * Mobile-first (360px base). Steps auto-save on Next so no data is lost
 * if the user closes mid-flow.
 *
 * Step 1: Tenure + Role + TikTok Shop status
 * Step 2: Current videos/day + Team mode
 * Step 3: Primary goal + Target videos/day
 * Step 4: GMV bucket (optional) + Finish
 */

import { useState } from 'react';
import { ChevronRight, ChevronLeft, Zap } from 'lucide-react';
import type { CreatorProfile } from '@/lib/creator-profile/schema';
import {
  CONTENT_TENURE_LABELS,
  TTS_TENURE_LABELS,
  VPD_LABELS,
  TARGET_VPD_LABELS,
  ROLE_LABELS,
  TIKTOK_SHOP_STATUS_LABELS,
  TEAM_MODE_LABELS,
  GOAL_LABELS,
  GMV_LABELS,
} from '@/lib/creator-profile/schema';
import { computeCreatorStage } from '@/lib/creator-profile/stage';

// ── Chip selector ─────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}
function Chip({ label, selected, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3 py-2.5 rounded-xl text-sm font-medium border transition-all text-left leading-snug
        min-h-[44px]
        ${selected
          ? 'border-teal-500 bg-teal-500/20 text-teal-300'
          : 'border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700/60'
        }
      `}
    >
      {label}
    </button>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-zinc-300 mb-2">{label}</p>
      <div className="grid grid-cols-1 gap-2">{children}</div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i < step ? 'bg-teal-500' : 'bg-zinc-700'
          }`}
        />
      ))}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ProfileDraft = Partial<CreatorProfile>;

interface WizardProps {
  onSave: (fields: Partial<CreatorProfile>) => Promise<void>;
  onComplete: (fields?: Partial<CreatorProfile>) => Promise<void>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function CreatorProfileWizard({ onSave, onComplete }: WizardProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>({});

  const TOTAL_STEPS = 4;

  function set<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  function toggle<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft(d => ({ ...d, [key]: d[key] === value ? undefined : value }));
  }

  async function saveAndNext() {
    setSaving(true);
    try {
      await onSave(draft);
      setStep(s => s + 1);
    } finally {
      setSaving(false);
    }
  }

  async function finish(skipGmv = false) {
    setSaving(true);
    try {
      const finalDraft = skipGmv ? { ...draft, monthly_gmv_bucket: undefined } : draft;
      await onComplete(finalDraft);
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    try {
      await onComplete(draft);
    } finally {
      setSaving(false);
    }
  }

  // ── Step renders ────────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-5">
        <FieldGroup label="How long have you been creating content?">
          {Object.entries(CONTENT_TENURE_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.content_creation_tenure === val}
              onClick={() => toggle('content_creation_tenure', val as CreatorProfile['content_creation_tenure'])}
            />
          ))}
        </FieldGroup>

        <FieldGroup label="How long have you been doing TikTok Shop / affiliate?">
          {Object.entries(TTS_TENURE_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.tts_affiliate_tenure === val}
              onClick={() => toggle('tts_affiliate_tenure', val as CreatorProfile['tts_affiliate_tenure'])}
            />
          ))}
        </FieldGroup>

        <FieldGroup label="What best describes your role?">
          {Object.entries(ROLE_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.role_type === val}
              onClick={() => toggle('role_type', val as CreatorProfile['role_type'])}
            />
          ))}
        </FieldGroup>

        <FieldGroup label="Are you in the TikTok Shop affiliate program?">
          {Object.entries(TIKTOK_SHOP_STATUS_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.tiktok_shop_status === val}
              onClick={() => toggle('tiktok_shop_status', val as CreatorProfile['tiktok_shop_status'])}
            />
          ))}
        </FieldGroup>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-5">
        <FieldGroup label="How many videos do you post per day right now?">
          {Object.entries(VPD_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.current_videos_per_day === val}
              onClick={() => toggle('current_videos_per_day', val as CreatorProfile['current_videos_per_day'])}
            />
          ))}
        </FieldGroup>

        <FieldGroup label="How do you work?">
          {Object.entries(TEAM_MODE_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.team_mode === val}
              onClick={() => toggle('team_mode', val as CreatorProfile['team_mode'])}
            />
          ))}
        </FieldGroup>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="space-y-5">
        <FieldGroup label="What's your #1 goal for the next 30 days?">
          {Object.entries(GOAL_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.primary_goal_30d === val}
              onClick={() => toggle('primary_goal_30d', val as CreatorProfile['primary_goal_30d'])}
            />
          ))}
        </FieldGroup>

        <FieldGroup label="How many videos per day do you want to reach?">
          {Object.entries(TARGET_VPD_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.target_videos_per_day === val}
              onClick={() => toggle('target_videos_per_day', val as CreatorProfile['target_videos_per_day'])}
            />
          ))}
        </FieldGroup>
      </div>
    );
  }

  function renderStep4() {
    const stageResult = computeCreatorStage(draft);

    const STAGE_COPY: Record<string, string> = {
      Starter:  "You're just getting started with TikTok Shop. We'll help you find your first winning products.",
      Builder:  "You're posting consistently. FlashFlow will help you increase output and find winners.",
      Scaling:  "You're already producing high volume. FlashFlow will help automate and systemize your pipeline.",
      Advanced: "You're operating at scale. FlashFlow will help you manage output and track performance.",
    };

    return (
      <div className="space-y-5">
        {/* Stage reveal card */}
        <div className={`p-4 rounded-xl border ${stageResult.bg} border-current/20`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${stageResult.bg} ${stageResult.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {stageResult.stage}
            </span>
          </div>
          <p className={`text-sm leading-relaxed ${stageResult.color}`}>
            {STAGE_COPY[stageResult.stage]}
          </p>
        </div>

        {/* GMV — optional */}
        <div className="p-3 rounded-xl bg-zinc-800/60 border border-zinc-700 text-xs text-zinc-500 leading-relaxed">
          One more optional question — helps us personalise tips. Skip if you prefer.
        </div>

        <FieldGroup label="What's your approximate monthly GMV (sales driven by your content)?">
          {Object.entries(GMV_LABELS).map(([val, label]) => (
            <Chip
              key={val}
              label={label}
              selected={draft.monthly_gmv_bucket === val}
              onClick={() => toggle('monthly_gmv_bucket', val as CreatorProfile['monthly_gmv_bucket'])}
            />
          ))}
        </FieldGroup>
      </div>
    );
  }

  // ── Step metadata ───────────────────────────────────────────────────────────

  const STEP_META = [
    { title: 'Your Background', subtitle: 'Help us understand your experience level' },
    { title: 'Your Workflow',   subtitle: 'Tell us how you currently operate' },
    { title: 'Your Goals',      subtitle: 'What do you want to achieve?' },
    { title: 'Your Setup is Ready', subtitle: "Here's what we've worked out for you" },
  ];

  const meta = STEP_META[step - 1];

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-4 bg-black/85 backdrop-blur-sm">
      {/* Modal — max 480px, mobile-first */}
      <div className="relative w-full max-w-[420px] max-h-[90dvh] flex flex-col bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-teal-400" />
              </div>
              <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">Creator Profile</span>
            </div>
            <button
              onClick={skip}
              disabled={saving}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded"
            >
              Skip for now
            </button>
          </div>

          <ProgressBar step={step} total={TOTAL_STEPS} />

          <div className="mt-3">
            <h2 className="text-lg font-bold text-zinc-100">{meta.title}</h2>
            <p className="text-sm text-zinc-400 mt-0.5">{meta.subtitle}</p>
          </div>

          <p className="text-xs text-zinc-600 mt-1">Step {step} of {TOTAL_STEPS}</p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-zinc-800 flex items-center gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 transition-colors min-h-[44px]"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          <div className="flex-1" />

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={saveAndNext}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-60 transition-colors min-h-[44px]"
            >
              {saving ? 'Saving…' : 'Next'}
              {!saving && <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => finish(true)}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 transition-colors min-h-[44px]"
              >
                Skip GMV
              </button>
              <button
                type="button"
                onClick={() => finish(false)}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-60 transition-colors min-h-[44px]"
              >
                {saving ? 'Finishing…' : 'Finish'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
