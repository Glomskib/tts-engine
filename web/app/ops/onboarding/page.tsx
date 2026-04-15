'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, ArrowRight, Check } from 'lucide-react';
import { BRAND } from '@/lib/branding';

const GOALS = [
  { id: 'content', label: 'Content', desc: 'Videos, scripts, social posts' },
  { id: 'leads', label: 'Leads', desc: 'Outreach, follow-ups, pipeline' },
  { id: 'sales', label: 'Sales', desc: 'Orders, inventory, fulfillment' },
  { id: 'operations', label: 'Operations', desc: 'Tasks, monitoring, reporting' },
];

const STAGES = [
  { id: 'starting', label: 'Just starting', desc: 'Setting things up' },
  { id: 'revenue', label: 'Making money', desc: 'Revenue flowing, need systems' },
  { id: 'scaling', label: 'Scaling', desc: 'Growing fast, need control' },
];

export default function OpsOnboardingPage() {
  const router = useRouter();
  const a = BRAND.accentClasses;
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [stage, setStage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/client/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, goal, stage }),
      });
      if (res.ok) {
        router.push('/dashboard');
      }
    } catch {
      router.push('/dashboard');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 w-12 rounded-full transition-colors ${s <= step ? a.primary : 'bg-zinc-800'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <Zap className={`w-8 h-8 ${a.text} mx-auto`} />
              <h1 className="text-2xl font-bold">Let&apos;s set up your system</h1>
              <p className="text-zinc-500 text-sm">Takes about 30 seconds.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wider font-medium block mb-2">
                Your name or business name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Brandon's Shop"
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                autoFocus
              />
            </div>
            <button
              onClick={() => name.trim() && setStep(2)}
              disabled={!name.trim()}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 ${a.primary} ${a.hover} disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm`}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">What should your system run?</h1>
              <p className="text-zinc-500 text-sm">Pick the area you want AI to handle first.</p>
            </div>
            <div className="space-y-2">
              {GOALS.map(g => (
                <button
                  key={g.id}
                  onClick={() => { setGoal(g.id); setStep(3); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors text-left ${
                    goal === g.id
                      ? `${a.border} ${a.bg}`
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    goal === g.id ? `border-transparent ${a.primary}` : 'border-zinc-700'
                  }`}>
                    {goal === g.id && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{g.label}</div>
                    <div className="text-xs text-zinc-500">{g.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">Where are you at?</h1>
              <p className="text-zinc-500 text-sm">This helps us set up the right tasks.</p>
            </div>
            <div className="space-y-2">
              {STAGES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStage(s.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors text-left ${
                    stage === s.id
                      ? `${a.border} ${a.bg}`
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    stage === s.id ? `border-transparent ${a.primary}` : 'border-zinc-700'
                  }`}>
                    {stage === s.id && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{s.label}</div>
                    <div className="text-xs text-zinc-500">{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            {stage && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 ${a.primary} ${a.hover} disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm`}
              >
                {submitting ? 'Setting up...' : 'Set Up My System'}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
