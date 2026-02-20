'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton, EmptyState, StatCard } from '../components/AdminPageLayout';

interface Hook {
  id: number;
  category: string;
  hook_text: string;
  angle: string | null;
  compliance_notes: string | null;
  status: string;
  created_at: string;
  source_doc_id: string | null;
  lane: string | null;
  tags: string[] | null;
}

const CATEGORIES = [
  'Curiosity Gap',
  'Social Proof',
  'Pain Point',
  'Before/After',
  'Unpopular Opinion',
  'Call-Out',
  'Urgency/FOMO',
  'Myth-Busting',
  'Lifestyle Flex',
  'Relatable Struggle',
];

const STATUSES = ['active', 'draft', 'archived'];

export default function AdminHookBankPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Import
  const [importDocId, setImportDocId] = useState('');
  const [importing, setImporting] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/hook-bank');
          return;
        }

        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (roleData.role !== 'admin') {
          router.push('/admin/pipeline');
          return;
        }

        setIsAdmin(true);
      } catch {
        router.push('/login?redirect=/admin/hook-bank');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch hooks
  const fetchHooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/hook-bank?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        setHooks(data.data.hooks);
        setTotal(data.data.total);
        setError('');
      } else {
        setError(data.error || 'Failed to load hooks');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchHooks();
  }, [isAdmin, fetchHooks]);

  // Copy hook text
  const handleCopy = async (hook: Hook) => {
    await navigator.clipboard.writeText(hook.hook_text);
    setCopiedId(hook.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Export CSV
  const handleExport = () => {
    window.open('/api/admin/hook-bank/export', '_blank');
  };

  // Import from MC
  const handleImport = async () => {
    if (!importDocId.trim()) return;
    setImporting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/hook-bank/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: importDocId.trim() }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: `Imported ${data.data.imported} hooks from MC doc` });
        setImportDocId('');
        fetchHooks();
      } else {
        setMessage({ type: 'error', text: data.error || 'Import failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error during import' });
    } finally {
      setImporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <p className="text-zinc-500">Checking access...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <p className="text-zinc-500">Redirecting...</p>
      </div>
    );
  }

  const categoryCounts = hooks.reduce<Record<string, number>>((acc, h) => {
    acc[h.category] = (acc[h.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <AdminPageLayout
      title="Hook Bank"
      subtitle={`${total} hooks across ${Object.keys(categoryCounts).length} categories`}
      maxWidth="2xl"
      headerActions={
        <AdminButton onClick={handleExport} variant="secondary" size="sm">
          Export CSV
        </AdminButton>
      }
    >
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Hooks" value={total} />
        <StatCard label="Categories" value={Object.keys(categoryCounts).length} />
        <StatCard
          label="Active"
          value={hooks.filter(h => h.status === 'active').length}
          variant="success"
        />
        <StatCard
          label="Draft/Archived"
          value={hooks.filter(h => h.status !== 'active').length}
          variant="warning"
        />
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Import from MC */}
      <AdminCard title="Import from Mission Control">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              MC Document ID
            </label>
            <input
              type="text"
              value={importDocId}
              onChange={(e) => setImportDocId(e.target.value)}
              placeholder="e.g. f6397d54-bafb-4e98-bf12-76f282b96517"
              className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <AdminButton
            onClick={handleImport}
            disabled={importing || !importDocId.trim()}
            size="md"
          >
            {importing ? 'Importing...' : 'Import'}
          </AdminButton>
        </div>
      </AdminCard>

      {/* Filters */}
      <AdminCard title="Hooks" noPadding>
        <div className="px-5 py-3 border-b border-white/10 flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hooks..."
            className="flex-1 px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-12 text-center text-zinc-500">Loading hooks...</div>
        ) : error ? (
          <div className="py-12 text-center text-red-400">{error}</div>
        ) : hooks.length === 0 ? (
          <EmptyState
            title="No hooks found"
            description="Import hooks from a Mission Control document or adjust your filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Category</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Hook Text</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {hooks.map((hook) => (
                  <tr key={hook.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-zinc-500 font-mono text-xs">{hook.id}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        {hook.category}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-200 max-w-md">{hook.hook_text}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        hook.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : hook.status === 'draft'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                      }`}>
                        {hook.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopy(hook)}
                        className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                      >
                        {copiedId === hook.id ? 'Copied!' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </AdminPageLayout>
  );
}
