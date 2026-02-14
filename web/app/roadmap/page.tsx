'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Loader2, Lightbulb, Sparkles, Wrench } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  planned: { label: 'Planned', color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20' },
  in_progress: { label: 'In Progress', color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20' },
  done: { label: 'Done', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20' },
};

const TYPE_ICON: Record<string, typeof Lightbulb> = {
  feature: Lightbulb,
  improvement: Sparkles,
  bug: Wrench,
};

interface RoadmapItem {
  id: string;
  type: string;
  title: string;
  status: string;
  updated_at: string;
}

export default function RoadmapPage() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'planned' | 'in_progress' | 'done'>('all');

  useEffect(() => {
    const fetchRoadmap = async () => {
      try {
        const res = await fetch('/api/feedback/roadmap');
        if (res.ok) {
          const json = await res.json();
          setItems(json.data || []);
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };
    fetchRoadmap();
  }, []);

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);

  const planned = items.filter((i) => i.status === 'planned');
  const inProgress = items.filter((i) => i.status === 'in_progress');
  const done = items.filter((i) => i.status === 'done');

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/FFAI.png" alt="FlashFlow AI" width={32} height={32} className="rounded-lg" />
              <span className="font-bold text-lg">FlashFlow AI</span>
            </Link>
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-100">Product Roadmap</h1>
          <p className="mt-2 text-zinc-400">
            See what we&apos;re working on and what&apos;s coming next.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mb-8">
          {[
            { key: 'all', label: `All (${items.length})` },
            { key: 'in_progress', label: `In Progress (${inProgress.length})` },
            { key: 'planned', label: `Planned (${planned.length})` },
            { key: 'done', label: `Done (${done.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === tab.key
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-zinc-500">
            {items.length === 0
              ? 'No roadmap items yet. Check back soon!'
              : 'No items match this filter.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG.planned;
              const Icon = TYPE_ICON[item.type] || Lightbulb;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-4 px-5 py-4 rounded-xl border ${statusInfo.bgColor}`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${statusInfo.color}`} />
                  <span className="text-sm font-medium text-zinc-200 flex-1">{item.title}</span>
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusInfo.color} bg-white/5`}>
                    {statusInfo.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
