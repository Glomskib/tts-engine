'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Rocket, CheckCircle2, Package, UserCheck,
  Sparkles, Trophy, ChevronDown, ChevronUp, X,
} from 'lucide-react';

const DISMISSED_KEY = 'ff-quickstart-dismissed';

interface QuickStartStep {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Package;
}

const STEPS: QuickStartStep[] = [
  {
    id: 'account',
    label: 'Create your account',
    description: 'You\'re already here!',
    href: '#',
    icon: CheckCircle2,
  },
  {
    id: 'product',
    label: 'Add your first product',
    description: 'Tell FlashFlow what you sell',
    href: '/admin/products',
    icon: Package,
  },
  {
    id: 'persona',
    label: 'Create an audience persona',
    description: 'Define who you\'re selling to',
    href: '/admin/audience',
    icon: UserCheck,
  },
  {
    id: 'script',
    label: 'Generate your first script',
    description: 'Let AI write a video script for you',
    href: '/admin/content-studio',
    icon: Sparkles,
  },
  {
    id: 'winner',
    label: 'Save a winner to Winners Bank',
    description: 'Import a top-performing video',
    href: '/admin/winners/import',
    icon: Trophy,
  },
];

export default function QuickStart() {
  const [dismissed, setDismissed] = useState(true); // hidden until we check
  const [collapsed, setCollapsed] = useState(false);
  const [counts, setCounts] = useState<Record<string, number | null>>({
    product: null,
    persona: null,
    script: null,
    winner: null,
  });
  const completedRef = useRef(false);

  // Check dismissed state from localStorage
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
  }, []);

  // Fetch completion counts from existing APIs
  const fetchCounts = useCallback(async () => {
    try {
      const [productsRes, personasRes, skitsRes, winnersRes] = await Promise.all([
        fetch('/api/products?limit=1'),
        fetch('/api/audience/personas?limit=50'),
        fetch('/api/skits?limit=1'),
        fetch('/api/winners?limit=1'),
      ]);

      // Products: { ok, data: { products, total } }
      if (productsRes.ok) {
        const json = await productsRes.json();
        setCounts(prev => ({ ...prev, product: json.data?.total ?? json.data?.products?.length ?? 0 }));
      } else {
        setCounts(prev => ({ ...prev, product: 0 }));
      }

      // Personas: { ok, data: [...] } — filter out system personas
      if (personasRes.ok) {
        const json = await personasRes.json();
        const userPersonas = (json.data || []).filter(
          (p: { is_system?: boolean }) => !p.is_system
        );
        setCounts(prev => ({ ...prev, persona: userPersonas.length }));
      } else {
        setCounts(prev => ({ ...prev, persona: 0 }));
      }

      // Skits: { ok, data: [...], pagination: { total } }
      if (skitsRes.ok) {
        const json = await skitsRes.json();
        setCounts(prev => ({ ...prev, script: json.pagination?.total ?? json.data?.length ?? 0 }));
      } else {
        setCounts(prev => ({ ...prev, script: 0 }));
      }

      // Winners: { ok, winners: [...] }
      if (winnersRes.ok) {
        const json = await winnersRes.json();
        setCounts(prev => ({ ...prev, winner: json.winners?.length ?? 0 }));
      } else {
        setCounts(prev => ({ ...prev, winner: 0 }));
      }
    } catch {
      setCounts({ product: 0, persona: 0, script: 0, winner: 0 });
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  // Determine completed steps
  const completedSteps = new Set<string>();
  completedSteps.add('account'); // Always done
  if (counts.product !== null && counts.product > 0) completedSteps.add('product');
  if (counts.persona !== null && counts.persona > 0) completedSteps.add('persona');
  if (counts.script !== null && counts.script > 0) completedSteps.add('script');
  if (counts.winner !== null && counts.winner > 0) completedSteps.add('winner');

  const completedCount = completedSteps.size;
  const totalSteps = STEPS.length;
  const allDone = completedCount === totalSteps;
  const progress = (completedCount / totalSteps) * 100;

  // Auto-dismiss when all complete
  useEffect(() => {
    if (allDone && !completedRef.current) {
      completedRef.current = true;
      fetch('/api/onboarding/complete', { method: 'POST' }).catch(() => {});
    }
  }, [allDone]);

  // Don't render if dismissed, all done, or still loading
  if (dismissed || allDone) return null;
  if (Object.values(counts).some(v => v === null)) return null;

  return (
    <div className="bg-gradient-to-r from-teal-500/5 via-zinc-900 to-zinc-900 border border-teal-500/20 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <Rocket className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Quick Start
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {completedCount} of {totalSteps} complete
              </span>
            </h3>
            {/* Progress bar */}
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-32 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 font-medium">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
            className="px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
          >
            Dismiss
          </button>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Steps */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-1">
          {STEPS.map((step) => {
            const done = completedSteps.has(step.id);
            const Icon = step.icon;
            return done ? (
              <div
                key={step.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-50"
              >
                <div className="w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                </div>
                <p className="text-sm text-zinc-500 line-through">{step.label}</p>
              </div>
            ) : (
              <Link
                key={step.id}
                href={step.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 transition-colors group"
              >
                <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  <Icon className="w-3 h-3 text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200">{step.label}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{step.description}</p>
                </div>
                <span className="text-xs text-teal-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  Go &rarr;
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
