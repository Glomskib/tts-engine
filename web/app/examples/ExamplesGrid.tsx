'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ScriptExample {
  id: string;
  persona: string;
  category: string;
  product: string;
  hook: string;
  script: string;
}

const PERSONA_COLORS: Record<string, string> = {
  'Skeptic Convert': 'bg-amber-500/10 text-amber-400',
  'Honest Reviewer': 'bg-blue-500/10 text-blue-400',
  'Excited Discovery': 'bg-pink-500/10 text-pink-400',
  'Storyteller': 'bg-violet-500/10 text-violet-400',
  'Authority Expert': 'bg-emerald-500/10 text-emerald-400',
  'Relatable Friend': 'bg-teal-500/10 text-teal-400',
  'Trend Spotter': 'bg-red-500/10 text-red-400',
};

export function ExamplesGrid({
  examples,
  categories,
}: {
  examples: ScriptExample[];
  categories: string[];
}) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = activeCategory === 'All'
    ? examples
    : examples.filter((e) => e.category === activeCategory);

  return (
    <>
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-8 justify-center">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setExpandedId(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-teal-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((example) => {
          const isExpanded = expandedId === example.id;
          const colorClass = PERSONA_COLORS[example.persona] || 'bg-zinc-500/10 text-zinc-400';

          return (
            <div
              key={example.id}
              className={`bg-zinc-900/60 border border-white/10 rounded-xl overflow-hidden transition-all ${
                isExpanded ? 'sm:col-span-2 lg:col-span-3' : ''
              }`}
            >
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                    {example.persona}
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-zinc-700/50 text-zinc-400">
                    {example.category}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-zinc-300 mb-2">{example.product}</h3>
                <p className="text-zinc-200 italic mb-4">
                  &ldquo;{example.hook}&rdquo;
                </p>

                {isExpanded ? (
                  <div className="mt-4">
                    <div className="bg-zinc-800/60 rounded-lg p-4 mb-4">
                      <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
                        {example.script}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setExpandedId(null)}
                        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Collapse
                      </button>
                      <Link
                        href="/login?mode=signup"
                        className="text-sm px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium"
                      >
                        Generate Scripts Like This
                      </Link>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedId(example.id)}
                    className="text-sm text-teal-400 hover:text-teal-300 transition-colors"
                  >
                    Read full script &rarr;
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
