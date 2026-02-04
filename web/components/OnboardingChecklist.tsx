'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronRight, X, Sparkles, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

interface OnboardingChecklistProps {
  className?: string;
}

export function OnboardingChecklist({ className = '' }: OnboardingChecklistProps) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOnboardingStatus();
  }, []);

  const fetchOnboardingStatus = async () => {
    try {
      const response = await fetch('/api/onboarding/status');
      if (response.ok) {
        const data = await response.json();
        setSteps(data.steps || []);
        setDismissed(data.dismissed || false);
      }
    } catch (error) {
      console.error('Failed to fetch onboarding status:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissOnboarding = async () => {
    try {
      await fetch('/api/onboarding/dismiss', { method: 'POST' });
      setDismissed(true);
    } catch (error) {
      console.error('Failed to dismiss onboarding:', error);
    }
  };

  if (loading) {
    return (
      <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-6 ${className}`}>
        <div className="flex items-center justify-center gap-2 text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (dismissed || steps.length === 0) return null;

  const completedCount = steps.filter(s => s.completed).length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  // Hide if all steps completed
  if (completedCount === steps.length) return null;

  return (
    <div className={`bg-gradient-to-r from-teal-500/10 to-purple-500/10 border border-teal-500/20 rounded-xl p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Get Started with FlashFlow</h3>
            <p className="text-sm text-zinc-400">Complete these steps to unlock the full potential</p>
          </div>
        </div>
        <button type="button"
          onClick={dismissOnboarding}
          className="p-1 rounded hover:bg-zinc-800 transition-colors"
          aria-label="Dismiss onboarding"
        >
          <X className="w-4 h-4 text-zinc-500" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-zinc-400">{completedCount} of {steps.length} complete</span>
          <span className="text-teal-400">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-purple-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <Link
            key={step.id}
            href={step.href}
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
              step.completed
                ? 'bg-zinc-800/50 opacity-60'
                : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              step.completed
                ? 'bg-teal-500 text-white'
                : 'bg-zinc-700 text-zinc-400'
            }`}>
              {step.completed ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className="text-xs font-medium">{index + 1}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.completed ? 'text-zinc-500 line-through' : 'text-white'}`}>
                {step.title}
              </p>
              <p className="text-xs text-zinc-500 truncate">{step.description}</p>
            </div>
            {!step.completed && (
              <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default OnboardingChecklist;
