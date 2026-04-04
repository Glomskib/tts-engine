'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  Plus,
  Loader2,
  Trophy,
  Play,
  Pause,
  CheckCircle,
  Trash2,
  Zap,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminPageLayout, { AdminCard, EmptyState } from '@/app/admin/components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import type { Experiment } from '@/lib/brands/types';

const STATUS_OPTIONS = ['draft', 'running', 'paused', 'completed'] as const;

export default function AdminExperimentsPage() {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newBrandId, setNewBrandId] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newHypothesis, setNewHypothesis] = useState('');
  const [sprintLoading, setSprintLoading] = useState<string | null>(null);

  const startSprint = async (experimentId: string) => {
    setSprintLoading(experimentId);
    try {
      const res = await fetch('/api/admin/recording-sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment_id: experimentId }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess(`Sprint started: ${data.data.total_items} items`);
        router.push(`/admin/recording-sprint/${data.data.sprint_id}`);
      } else {
        showError(data.error || data.message || 'Failed to start sprint');
      }
    } catch {
      showError('Failed to start sprint');
    } finally {
      setSprintLoading(null);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      // Fetch brands the operator has access to
      const brandsRes = await fetch('/api/brand/my-brands');
      const brandsData = await brandsRes.json();
      if (brandsData.ok) {
        setBrands(brandsData.data || []);
        if (brandsData.data?.length && !newBrandId) {
          setNewBrandId(brandsData.data[0].id);
        }
      }

      // Fetch experiments for all brands or selected brand
      const brandIds = brandsData.ok ? brandsData.data.map((b: { id: string }) => b.id) : [];
      const allExperiments: Experiment[] = [];
      for (const brandId of brandIds) {
        const res = await fetch(`/api/brand/experiments?brand_id=${brandId}`);
        const data = await res.json();
        if (data.ok) allExperiments.push(...data.data);
      }
      setExperiments(allExperiments);
    } catch {
      showError('Failed to load experiments');
    } finally {
      setLoading(false);
    }
  }, [showError, newBrandId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createExperiment = async () => {
    if (!newName.trim() || !newBrandId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/brand/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: newBrandId,
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

  const filtered = experiments
    .filter(e => selectedBrand === 'all' || e.brand_id === selectedBrand)
    .filter(e => filterStatus === 'all' || e.status === filterStatus);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="w-3 h-3 text-teal-400" />;
      case 'paused': return <Pause className="w-3 h-3 text-amber-400" />;
      case 'completed': return <CheckCircle className="w-3 h-3 text-blue-400" />;
      default: return <FlaskConical className="w-3 h-3 text-zinc-400" />;
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <AdminPageLayout
      title="Experiments"
      subtitle="Manage creative experiments across your brands"
      stage="analytics"
    >
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={selectedBrand}
          onChange={e => setSelectedBrand(e.target.value)}
          className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-white"
        >
          <option value="all">All Brands</option>
          {brands.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <div className="flex gap-1">
          {['all', ...STATUS_OPTIONS].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                filterStatus === status
                  ? 'bg-teal-500/10 text-teal-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        <Link
          href="/admin/campaigns/new"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          Auto Campaign
        </Link>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Experiment
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <AdminCard title="New Experiment">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Name *</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Hook Style A/B Test" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Brand *</label>
                <select value={newBrandId} onChange={e => setNewBrandId(e.target.value)} className={inputClass}>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Goal</label>
              <input type="text" value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="What are we trying to learn?" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Hypothesis</label>
              <input type="text" value={newHypothesis} onChange={e => setNewHypothesis(e.target.value)} placeholder="We believe that..." className={inputClass} />
            </div>
            <div className="flex gap-2">
              <button onClick={createExperiment} disabled={creating || !newName.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
            </div>
          </div>
        </AdminCard>
      )}

      {/* Experiments list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="w-8 h-8" />}
          title="No experiments"
          description={experiments.length === 0 ? 'Create your first experiment to start testing creative variables.' : 'No experiments match your filters.'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(exp => (
            <AdminCard key={exp.id} title={exp.name} headerActions={
              <div className="flex items-center gap-2">
                {exp.winner_count > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <Trophy className="w-3 h-3" />
                    {exp.winner_count}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  {statusIcon(exp.status)}
                  {exp.status}
                </span>
              </div>
            }>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-xs text-zinc-500">Brand</div>
                  <div className="text-zinc-300">{exp.brand_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Product</div>
                  <div className="text-zinc-300">{exp.product_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Hooks</div>
                  <div className="text-zinc-300">{exp.hook_count}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Created</div>
                  <div className="text-zinc-300">{new Date(exp.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              {exp.goal && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="text-xs text-zinc-500 mb-1">Goal</div>
                  <div className="text-sm text-zinc-400">{exp.goal}</div>
                </div>
              )}
              {(exp.status === 'draft' || exp.status === 'running') && exp.hook_count > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <button
                    onClick={() => startSprint(exp.id)}
                    disabled={sprintLoading === exp.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Video className="w-3.5 h-3.5" />
                    {sprintLoading === exp.id ? 'Starting...' : 'Start Recording Sprint'}
                  </button>
                </div>
              )}
            </AdminCard>
          ))}
        </div>
      )}
    </AdminPageLayout>
  );
}
