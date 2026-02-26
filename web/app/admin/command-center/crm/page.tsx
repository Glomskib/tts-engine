'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, DollarSign, Target, TrendingUp } from 'lucide-react';
import CCSubnav from '../_components/CCSubnav';
import CrmBoardView from './_components/CrmBoardView';
import DealDrawer from './_components/DealDrawer';
import PipelineProgressBar from './_components/PipelineProgressBar';
import { formatDealValue } from './_components/constants';
import type { DealWithContact, PipelineStage } from './_components/constants';
import type { CrmPipeline, PipelineAnalytics } from '@/lib/command-center/crm-types';

export default function CrmPage() {
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [deals, setDeals] = useState<DealWithContact[]>([]);
  const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<DealWithContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDealTitle, setNewDealTitle] = useState('');
  const [newDealValue, setNewDealValue] = useState('');

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);
  const stages: PipelineStage[] = selectedPipeline?.stages || [];

  // Fetch pipelines
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/crm/pipelines');
      if (res.ok) {
        const json = await res.json();
        const pipelineList = json.data || [];
        setPipelines(pipelineList);
        if (pipelineList.length > 0 && !selectedPipelineId) {
          setSelectedPipelineId(pipelineList[0].id);
        }
      }
    })();
  }, []);

  // Fetch deals + analytics when pipeline changes
  const fetchData = useCallback(async () => {
    if (!selectedPipelineId) return;
    setLoading(true);
    try {
      const [dealsRes, analyticsRes] = await Promise.all([
        fetch(`/api/admin/crm/deals?pipeline_id=${selectedPipelineId}`),
        fetch(`/api/admin/crm/analytics?pipeline_id=${selectedPipelineId}`),
      ]);
      if (dealsRes.ok) {
        const json = await dealsRes.json();
        setDeals(json.data || []);
      }
      if (analyticsRes.ok) {
        const json = await analyticsRes.json();
        setAnalytics(json.data || null);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPipelineId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleUpdateDeal(dealId: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/admin/crm/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      // Refresh data
      fetchData();
      // Update selected deal if it's the one being modified
      if (selectedDeal?.id === dealId) {
        const json = await res.json();
        setSelectedDeal(json.data);
      }
    }
  }

  async function handleQuickAdd() {
    if (!newDealTitle.trim() || !selectedPipelineId || stages.length === 0) return;
    const valueCents = Math.round(parseFloat(newDealValue || '0') * 100);

    const res = await fetch('/api/admin/crm/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pipeline_id: selectedPipelineId,
        title: newDealTitle.trim(),
        stage_key: stages[0].key,
        value_cents: valueCents,
      }),
    });

    if (res.ok) {
      setNewDealTitle('');
      setNewDealValue('');
      setShowAddForm(false);
      fetchData();
    }
  }

  // Revenue calculations
  const totalValue = deals.reduce((sum, d) => sum + d.value_cents, 0);
  const weightedValue = deals.reduce((sum, d) => sum + Math.round(d.value_cents * (d.probability / 100)), 0);
  const dealCount = deals.length;

  return (
    <div className="space-y-6">
      <CCSubnav />
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">CRM</h2>

        <div className="flex items-center gap-3">
          {/* Pipeline selector */}
          <select
            value={selectedPipelineId}
            onChange={(e) => setSelectedPipelineId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Deal
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick-add form */}
      {showAddForm && (
        <div className="flex items-center gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <input
            value={newDealTitle}
            onChange={(e) => setNewDealTitle(e.target.value)}
            placeholder="Deal title..."
            className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600"
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
          />
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 text-sm">$</span>
            <input
              value={newDealValue}
              onChange={(e) => setNewDealValue(e.target.value)}
              placeholder="Value"
              type="number"
              min="0"
              step="0.01"
              className="w-24 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600"
              onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
            />
          </div>
          <button
            onClick={handleQuickAdd}
            disabled={!newDealTitle.trim()}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50"
          >
            Create
          </button>
          <button
            onClick={() => setShowAddForm(false)}
            className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Revenue summary bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Total Value</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{formatDealValue(totalValue)}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Weighted Value</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{formatDealValue(weightedValue)}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Deals</span>
            <Target className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">{dealCount}</div>
        </div>
      </div>

      {/* Pipeline progress bar */}
      {analytics && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-4">Pipeline Progress</h3>
          <PipelineProgressBar
            stages={analytics.stages}
            conversionRates={analytics.conversion_rates}
          />
        </div>
      )}

      {/* Board */}
      {stages.length > 0 && (
        <CrmBoardView
          deals={deals}
          stages={stages}
          onUpdateDeal={handleUpdateDeal}
          onSelectDeal={setSelectedDeal}
        />
      )}

      {loading && deals.length === 0 && (
        <div className="py-16 text-center text-zinc-500">Loading pipeline...</div>
      )}

      {/* Deal drawer */}
      {selectedDeal && (
        <DealDrawer
          deal={selectedDeal}
          stages={stages}
          onClose={() => setSelectedDeal(null)}
          onUpdate={handleUpdateDeal}
        />
      )}
    </div>
  );
}
