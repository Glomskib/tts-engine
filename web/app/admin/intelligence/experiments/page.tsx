'use client';

import { useState } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard } from '../../components/AdminPageLayout';
import { Sparkles, Loader2, FlaskConical, ArrowRight, Plus } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface HookVariation {
  hook: string;
  variation_1: string;
  variation_2: string;
  variation_3: string;
}

export default function ExperimentsPage() {
  const { showSuccess, showError } = useToast();
  const [experiments, setExperiments] = useState<HookVariation[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence/experiments', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setExperiments(json.data || []);
        setGenerated(true);
        if (json.data?.length > 0) {
          showSuccess(`Generated ${json.data.length} experiment${json.data.length !== 1 ? 's' : ''}`);
        }
      } else {
        showError(json.error || 'Failed to generate');
      }
    } catch {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const studioLink = (hook: string) => {
    const params = new URLSearchParams({ inspiration: hook });
    return `/admin/content-studio?${params.toString()}`;
  };

  return (
    <AdminPageLayout
      title="Experiment Generator"
      subtitle="Generate new content ideas based on your winning hooks"
      maxWidth="2xl"
    >
      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full min-h-[56px] rounded-xl text-base font-semibold transition-colors bg-teal-600 text-white active:bg-teal-700 disabled:opacity-50"
      >
        {loading ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Generating Experiments...</>
        ) : (
          <><FlaskConical className="w-5 h-5" /> Generate Experiments</>
        )}
      </button>

      {/* Results */}
      {generated && experiments.length === 0 && (
        <AdminCard title="No Data Yet">
          <p className="text-sm text-zinc-500 py-4 text-center">
            You need hook patterns with performance data first. Post more content and the system will detect winning hooks.
          </p>
        </AdminCard>
      )}

      {experiments.map((exp, idx) => (
        <AdminCard key={idx} title={`Experiment ${idx + 1}`} subtitle={`Based on: "${exp.hook}"`}>
          <div className="space-y-3">
            {[exp.variation_1, exp.variation_2, exp.variation_3].map((v, vi) => (
              <div key={vi} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-teal-400 bg-teal-400/10 px-2 py-0.5 rounded-full mt-0.5">V{vi + 1}</span>
                  <p className="text-sm text-white leading-relaxed">&ldquo;{v}&rdquo;</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={studioLink(v)}
                    className="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-lg text-sm font-medium bg-teal-600 text-white active:bg-teal-700"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Create Script
                  </Link>
                  <Link
                    href={`/admin/content-items?action=create&title=${encodeURIComponent(v)}`}
                    className="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-lg text-sm font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 active:bg-zinc-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> Content Item
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>
      ))}
    </AdminPageLayout>
  );
}
