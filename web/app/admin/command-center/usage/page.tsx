'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import CommandCenterShell from '../_components/CommandCenterShell';

interface RollupRow {
  day: string;
  provider: string;
  model: string;
  agent_id: string;
  project_id: string | null;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  errors: number;
}

interface UsageEventRow {
  id: string;
  ts: string;
  provider: string;
  model: string;
  agent_id: string;
  request_type: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  status: string;
  error_code: string | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString();
}

export default function UsagePage() {
  const [rollups, setRollups] = useState<RollupRow[]>([]);
  const [events, setEvents] = useState<UsageEventRow[]>([]);
  const [view, setView] = useState<'rollups' | 'events'>('rollups');
  const [from, setFrom] = useState(() => {
    const d = new Date(Date.now() - 7 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [drillFilter, setDrillFilter] = useState<{ provider?: string; model?: string; agent_id?: string }>({});
  const [loading, setLoading] = useState(true);

  const fetchRollups = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/usage/rollups?from=${from}&to=${to}`);
    if (res.ok) {
      const json = await res.json();
      setRollups(json.data || []);
    }
    setLoading(false);
  }, [from, to]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (drillFilter.provider) params.set('provider', drillFilter.provider);
    if (drillFilter.model) params.set('model', drillFilter.model);
    if (drillFilter.agent_id) params.set('agent_id', drillFilter.agent_id);
    const res = await fetch(`/api/admin/usage/events?${params}`);
    if (res.ok) {
      const json = await res.json();
      setEvents(json.data || []);
    }
    setLoading(false);
  }, [from, to, drillFilter]);

  useEffect(() => {
    if (view === 'rollups') fetchRollups();
    else fetchEvents();
  }, [view, fetchRollups, fetchEvents]);

  // Aggregate rollups by provider/model
  const grouped = rollups.reduce<Record<string, { requests: number; input_tokens: number; output_tokens: number; cost_usd: number; errors: number }>>((acc, r) => {
    const key = `${r.provider}/${r.model}`;
    if (!acc[key]) acc[key] = { requests: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, errors: 0 };
    acc[key].requests += r.requests;
    acc[key].input_tokens += r.input_tokens;
    acc[key].output_tokens += r.output_tokens;
    acc[key].cost_usd += r.cost_usd;
    acc[key].errors += r.errors;
    return acc;
  }, {});

  const totalCost = Object.values(grouped).reduce((s, g) => s + g.cost_usd, 0);
  const totalRequests = Object.values(grouped).reduce((s, g) => s + g.requests, 0);

  function drilldown(provider: string, model: string) {
    setDrillFilter({ provider, model });
    setView('events');
  }

  return (
    <CommandCenterShell>
      <h2 className="text-xl font-semibold text-white tracking-tight">API Usage</h2>

      {/* Date range + view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm" />
        <span className="text-zinc-600">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm" />
        <div className="flex border border-zinc-700 rounded overflow-hidden">
          <button onClick={() => setView('rollups')} className={`px-3 py-1.5 text-sm ${view === 'rollups' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}>Rollups</button>
          <button onClick={() => { setView('events'); setDrillFilter({}); }} className={`px-3 py-1.5 text-sm ${view === 'events' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}>Raw Events</button>
        </div>
        <button onClick={view === 'rollups' ? fetchRollups : fetchEvents} className="p-2 text-zinc-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {view === 'rollups' ? (
        <>
          {/* Summary */}
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-zinc-500">Total Cost: </span>
              <span className="text-emerald-400 font-bold">${totalCost.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Total Requests: </span>
              <span className="text-white font-bold">{totalRequests.toLocaleString()}</span>
            </div>
          </div>

          {/* Grouped table */}
          <div className="border border-zinc-800 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                  <th className="px-4 py-3 font-medium">Provider / Model</th>
                  <th className="px-4 py-3 font-medium text-right">Requests</th>
                  <th className="px-4 py-3 font-medium text-right">Input Tokens</th>
                  <th className="px-4 py-3 font-medium text-right">Output Tokens</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  <th className="px-4 py-3 font-medium text-right">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {Object.entries(grouped)
                  .sort((a, b) => b[1].cost_usd - a[1].cost_usd)
                  .map(([key, g]) => {
                    const [provider, model] = key.split('/');
                    return (
                      <tr
                        key={key}
                        className="hover:bg-zinc-800/50 cursor-pointer"
                        onClick={() => drilldown(provider, model)}
                      >
                        <td className="px-4 py-3 text-zinc-300 font-mono">{key}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{g.requests.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{g.input_tokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{g.output_tokens.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-emerald-400">${g.cost_usd.toFixed(4)}</td>
                        <td className="px-4 py-3 text-right text-red-400">{g.errors > 0 ? g.errors : '—'}</td>
                      </tr>
                    );
                  })}
                {Object.keys(grouped).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">{loading ? 'Loading...' : 'No data for this range'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Drill filter display */}
          {(drillFilter.provider || drillFilter.model) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-zinc-500">Filtered:</span>
              {drillFilter.provider && <span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">{drillFilter.provider}</span>}
              {drillFilter.model && <span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">{drillFilter.model}</span>}
              <button onClick={() => setDrillFilter({})} className="text-zinc-500 hover:text-zinc-300 text-xs">Clear</button>
            </div>
          )}

          {/* Raw events table */}
          <div className="border border-zinc-800 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">In</th>
                  <th className="px-4 py-3 font-medium text-right">Out</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  <th className="px-4 py-3 font-medium text-right">ms</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-800/50">
                    <td className="px-4 py-2 text-zinc-400 text-xs font-mono whitespace-nowrap">{new Date(e.ts).toLocaleString()}</td>
                    <td className="px-4 py-2 text-zinc-300">{e.provider}</td>
                    <td className="px-4 py-2 text-zinc-300 font-mono text-xs">{e.model}</td>
                    <td className="px-4 py-2 text-zinc-400">{e.agent_id}</td>
                    <td className="px-4 py-2 text-zinc-400">{e.request_type}</td>
                    <td className="px-4 py-2 text-right text-zinc-400">{e.input_tokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-zinc-400">{e.output_tokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-emerald-400">${Number(e.cost_usd).toFixed(6)}</td>
                    <td className="px-4 py-2 text-right text-zinc-500">{e.latency_ms ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 text-xs rounded ${e.status === 'ok' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-zinc-500">{loading ? 'Loading...' : 'No events'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
