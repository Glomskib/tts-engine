'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FlaskConical,
  Plus,
  Loader2,
  Trophy,
  ChevronRight,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { Experiment } from '@/lib/brands/types';

const STATUS_OPTIONS = ['draft', 'running', 'paused', 'completed'] as const;

function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'bg-zinc-500/10', text: 'text-zinc-400' },
    running: { bg: 'bg-teal-500/10', text: 'text-teal-400' },
    paused: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
    completed: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  };
  const s = statusColors[experiment.status] || statusColors.draft;

  return (
    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200 truncate">{experiment.name}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{experiment.product_name || 'No product'}</p>
        </div>
        <span className={`px-2 py-0.5 text-xs rounded-full ${s.bg} ${s.text}`}>
          {experiment.status}
        </span>
      </div>

      {experiment.goal && (
        <p className="text-xs text-zinc-400 mb-3 line-clamp-2">{experiment.goal}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <FlaskConical className="w-3 h-3" />
          {experiment.hook_count} hooks
        </span>
        {experiment.winner_count > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <Trophy className="w-3 h-3" />
            {experiment.winner_count} winners
          </span>
        )}
        <ChevronRight className="w-3 h-3 ml-auto text-zinc-600" />
      </div>
    </div>
  );
}

export default function CreativeLabPage() {
  const searchParams = useSearchParams();
  const brandId = searchParams.get('brand_id');
  const { showSuccess, showError } = useToast();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Create form state
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newHypothesis, setNewHypothesis] = useState('');

  useEffect(() => {
    if (!brandId) return;
    fetch(`/api/brand/experiments?brand_id=${brandId}`)
      .then(r => r.json())
      .then(res => {
        if (res.ok) setExperiments(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [brandId]);

  const createExperiment = async () => {
    if (!newName.trim() || !brandId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/brand/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          name: newName,
          goal: newGoal || null,
          hypothesis: newHypothesis || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setExperiments(prev => [data.data, ...prev]);
        setNewName('');
        setNewGoal('');
        setNewHypothesis('');
        setShowCreate(false);
        showSuccess('Experiment created');
      } else {
        showError(data.message || 'Failed to create experiment');
      }
    } catch {
      showError('Failed to create experiment');
    } finally {
      setCreating(false);
    }
  };

  const filtered = filterStatus === 'all'
    ? experiments
    : experiments.filter(e => e.status === filterStatus);

  if (!brandId) {
    return (
      <div className="p-6">
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-8 text-center">
          <p className="text-sm text-zinc-500">No brand selected</p>
        </div>
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Creative Lab</h1>
          <p className="text-sm text-zinc-500 mt-1">Design and manage creative experiments</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Experiment
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-200">New Experiment</h2>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Name *</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g., Hook Style Test — Product X"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Goal</label>
            <input
              type="text"
              value={newGoal}
              onChange={e => setNewGoal(e.target.value)}
              placeholder="e.g., Find which hook style drives highest engagement"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Hypothesis</label>
            <input
              type="text"
              value={newHypothesis}
              onChange={e => setNewHypothesis(e.target.value)}
              placeholder="e.g., Curiosity hooks will outperform problem hooks by 20%"
              className={inputClass}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={createExperiment}
              disabled={creating || !newName.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {['all', ...STATUS_OPTIONS].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              filterStatus === status
                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 border border-white/5'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Experiments grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-8 text-center">
          <FlaskConical className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            {experiments.length === 0 ? 'No experiments yet. Create your first one above.' : 'No experiments match this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(exp => (
            <ExperimentCard key={exp.id} experiment={exp} />
          ))}
        </div>
      )}
    </div>
  );
}
