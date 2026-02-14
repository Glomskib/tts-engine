'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Package, Sparkles, Video, CheckCircle2,
  ChevronDown, ChevronUp, X, Mic,
} from 'lucide-react';

const DISMISSED_KEY = 'ff-setup-checklist-dismissed';

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Package;
}

const STEPS: ChecklistStep[] = [
  {
    id: 'product',
    label: 'Add a product',
    description: 'Tell FlashFlow what you sell',
    href: '/admin/products',
    icon: Package,
  },
  {
    id: 'script',
    label: 'Generate a script',
    description: 'Let AI write your first video script',
    href: '/admin/content-studio',
    icon: Sparkles,
  },
  {
    id: 'video',
    label: 'Review in pipeline',
    description: 'Track a video from script to TikTok',
    href: '/admin/pipeline',
    icon: Video,
  },
  {
    id: 'transcribe',
    label: 'Try the Transcriber',
    description: 'Grab a winning TikTok script in seconds',
    href: '/admin/transcribe',
    icon: Mic,
  },
];

interface SetupChecklistProps {
  scriptsCount: number;
  totalVideos: number;
}

export default function SetupChecklist({ scriptsCount, totalVideos }: SetupChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden until we check
  const [collapsed, setCollapsed] = useState(false);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [winnersCount, setWinnersCount] = useState<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
    setDismissed(wasDismissed);
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      const [productsRes, winnersRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/winners?limit=1'),
      ]);
      if (productsRes.ok) {
        const json = await productsRes.json();
        setProductCount(json.data?.length ?? 0);
      } else {
        setProductCount(0);
      }
      if (winnersRes.ok) {
        const json = await winnersRes.json();
        setWinnersCount(json.meta?.total ?? json.data?.length ?? 0);
      } else {
        setWinnersCount(0);
      }
    } catch {
      setProductCount(0);
      setWinnersCount(0);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
    // Also persist server-side
    fetch('/api/onboarding/dismiss', { method: 'POST' }).catch(() => {});
  };

  // Determine which steps are complete based on real data
  const completedSteps = new Set<string>();
  if (productCount !== null && productCount > 0) completedSteps.add('product');
  if (scriptsCount > 0) completedSteps.add('script');
  if (totalVideos > 0) completedSteps.add('video');
  if (winnersCount !== null && winnersCount > 0) completedSteps.add('transcribe');

  const completedCount = completedSteps.size;
  const allDone = completedCount === STEPS.length;

  // Auto-mark onboarding complete when all 3 steps are done
  useEffect(() => {
    if (allDone && !completedRef.current) {
      completedRef.current = true;
      fetch('/api/onboarding/complete', { method: 'POST' }).catch(() => {});
    }
  }, [allDone]);

  // Don't render if dismissed or all done
  if (dismissed || allDone) return null;

  // Still loading counts
  if (productCount === null || winnersCount === null) return null;

  const progress = (completedCount / STEPS.length) * 100;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header — always visible, clickable to collapse */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Getting Started
              <span className="ml-2 text-xs font-normal text-zinc-500">{completedCount}/{STEPS.length}</span>
            </h3>
            {/* Mini progress bar */}
            <div className="w-32 h-1 bg-zinc-700 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
            className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
            aria-label="Dismiss checklist"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Steps — collapsible */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-1">
          {STEPS.map((step) => {
            const done = completedSteps.has(step.id);
            const Icon = step.icon;
            return (
              <Link
                key={step.id}
                href={done ? '#' : step.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  done
                    ? 'opacity-50 cursor-default'
                    : 'hover:bg-zinc-800/50'
                }`}
                onClick={done ? (e: React.MouseEvent) => e.preventDefault() : undefined}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  done
                    ? 'bg-teal-500/20'
                    : 'bg-zinc-800 border border-zinc-700'
                }`}>
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  ) : (
                    <Icon className="w-3 h-3 text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                    {step.label}
                  </p>
                  {!done && (
                    <p className="text-xs text-zinc-600 mt-0.5">{step.description}</p>
                  )}
                </div>
                {!done && (
                  <span className="text-xs text-teal-400 shrink-0">Go &rarr;</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
