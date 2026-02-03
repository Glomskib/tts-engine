'use client';

import { Check, X } from 'lucide-react';

interface PainPoint {
  id?: string;
  point: string;
  category?: 'emotional' | 'practical' | 'social' | 'financial';
  intensity?: 'mild' | 'moderate' | 'severe';
  hook_angle?: string;
}

interface PainPointChecklistProps {
  painPoints: PainPoint[];
  addressedPoints: string[];
  showHookAngles?: boolean;
}

/**
 * Displays which pain points were addressed in generated content
 * with a coverage progress bar and checkmarks
 */
export function PainPointChecklist({
  painPoints,
  addressedPoints,
  showHookAngles = false
}: PainPointChecklistProps) {
  if (!painPoints?.length) return null;

  const addressedCount = addressedPoints.length;
  const totalCount = painPoints.length;
  const coverage = Math.round((addressedCount / totalCount) * 100);

  const getCoverageColor = (pct: number) => {
    if (pct >= 70) return { bg: 'bg-green-500', text: 'text-green-400', bgLight: 'bg-green-500/10' };
    if (pct >= 40) return { bg: 'bg-yellow-500', text: 'text-yellow-400', bgLight: 'bg-yellow-500/10' };
    return { bg: 'bg-red-500', text: 'text-red-400', bgLight: 'bg-red-500/10' };
  };

  const coverageColors = getCoverageColor(coverage);

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'emotional': return 'bg-pink-900/50 text-pink-300';
      case 'practical': return 'bg-blue-900/50 text-blue-300';
      case 'social': return 'bg-purple-900/50 text-purple-300';
      case 'financial': return 'bg-green-900/50 text-green-300';
      default: return 'bg-zinc-700 text-zinc-300';
    }
  };

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Pain Points Addressed</h3>
        <span className={`text-sm font-bold ${coverageColors.text}`}>
          {addressedCount}/{totalCount} ({coverage}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-zinc-700 rounded-full mb-4 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${coverageColors.bg}`}
          style={{ width: `${coverage}%` }}
        />
      </div>

      {/* Pain points list */}
      <div className="space-y-2">
        {painPoints.map((pp, i) => {
          const ppId = pp.id || pp.point;
          const isAddressed = addressedPoints.some(
            addr => addr.toLowerCase().includes(pp.point.toLowerCase().slice(0, 20)) ||
                    pp.point.toLowerCase().includes(addr.toLowerCase().slice(0, 20))
          );

          return (
            <div
              key={ppId || i}
              className={`flex items-start gap-2 p-2 rounded-lg transition-colors ${
                isAddressed ? coverageColors.bgLight : 'bg-zinc-800'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                isAddressed ? coverageColors.bg : 'bg-zinc-700'
              }`}>
                {isAddressed ? (
                  <Check className="w-3 h-3 text-white" />
                ) : (
                  <X className="w-3 h-3 text-zinc-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${isAddressed ? 'text-white' : 'text-zinc-400'}`}>
                  {pp.point}
                </span>
                {pp.category && (
                  <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${getCategoryColor(pp.category)}`}>
                    {pp.category}
                  </span>
                )}
                {showHookAngles && pp.hook_angle && (
                  <div className="text-xs text-zinc-500 mt-1 italic">
                    Hook: &quot;{pp.hook_angle}&quot;
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Coverage summary */}
      {coverage < 40 && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-300">
            Low coverage: Consider regenerating with a focus on more pain points
          </p>
        </div>
      )}
    </div>
  );
}

export default PainPointChecklist;
