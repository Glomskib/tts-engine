'use client';

import { useState } from 'react';
import AdminPageLayout, { AdminCard } from '../../components/AdminPageLayout';
import { Brain, Loader2, Sparkles, FlaskConical, Lightbulb, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/contexts/ToastContext';

interface GrowthAdvice {
  growth_insights: string[];
  hook_ideas: string[];
  weekly_experiment: string;
}

export default function AdvisorPage() {
  const { showSuccess, showError } = useToast();
  const [data, setData] = useState<GrowthAdvice | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/growth-advice');
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
        showSuccess('Growth advice generated');
      } else {
        showError(json.error || 'Failed to generate advice');
      }
    } catch {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminPageLayout
      title="Growth Advisor"
      subtitle="AI-powered weekly growth strategy based on your data"
      maxWidth="2xl"
    >
      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full min-h-[56px] rounded-xl text-base font-semibold transition-colors bg-violet-600 text-white active:bg-violet-700 disabled:opacity-50"
      >
        {loading ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing Your Data...</>
        ) : (
          <><Brain className="w-5 h-5" /> Get Growth Advice</>
        )}
      </button>

      {data && (
        <>
          {/* Growth Insights */}
          <AdminCard title="Growth Insights" subtitle="Data-driven observations about your content">
            <div className="space-y-3">
              {data.growth_insights.map((insight, idx) => (
                <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
                  <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-white leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </AdminCard>

          {/* Hook Ideas */}
          <AdminCard title="Hook Ideas to Try" subtitle="New hooks based on your winning patterns">
            <div className="space-y-3">
              {data.hook_ideas.map((hook, idx) => (
                <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <p className="text-sm text-white leading-relaxed">&ldquo;{hook}&rdquo;</p>
                  <Link
                    href={`/admin/content-studio?inspiration=${encodeURIComponent(hook)}`}
                    className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-lg text-sm font-medium bg-teal-600 text-white active:bg-teal-700"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Create Script
                  </Link>
                </div>
              ))}
            </div>
          </AdminCard>

          {/* Weekly Experiment */}
          <AdminCard title="This Week's Experiment" subtitle="One specific thing to try">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <FlaskConical className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-white leading-relaxed">{data.weekly_experiment}</p>
              </div>
              <Link
                href={`/admin/content-studio?inspiration=${encodeURIComponent(data.weekly_experiment)}`}
                className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-lg text-sm font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 active:bg-zinc-700"
              >
                <ArrowRight className="w-3.5 h-3.5" /> Start Experiment
              </Link>
            </div>
          </AdminCard>
        </>
      )}
    </AdminPageLayout>
  );
}
