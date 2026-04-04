'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trophy, Loader2 } from 'lucide-react';
import type { ExperimentCreative } from '@/lib/brands/types';

export default function BrandWinnersPage() {
  const searchParams = useSearchParams();
  const brandId = searchParams.get('brand_id');
  const [winners, setWinners] = useState<ExperimentCreative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      return;
    }
    fetch(`/api/brand/dashboard?brand_id=${brandId}`)
      .then(r => r.json())
      .then(res => {
        if (res.ok) setWinners(res.data.recent_winners || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [brandId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">Winning Creatives</h1>
        <p className="text-sm text-zinc-500 mt-1">Creatives identified as top performers</p>
      </div>

      {winners.length === 0 ? (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-8 text-center">
          <Trophy className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No winners identified yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {winners.map(w => (
            <div key={w.id} className="bg-zinc-900/50 border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-200">
                  {w.content_item_title || 'Untitled Creative'}
                </h3>
                <Trophy className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {w.hook && (
                  <span className="px-2 py-0.5 bg-teal-500/10 text-teal-400 rounded-md">Hook: {w.hook}</span>
                )}
                {w.angle && (
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md">Angle: {w.angle}</span>
                )}
                {w.persona && (
                  <span className="px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-md">Persona: {w.persona}</span>
                )}
                {w.cta && (
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md">CTA: {w.cta}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
