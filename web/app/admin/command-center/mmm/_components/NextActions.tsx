import { ArrowRight, AlertCircle } from 'lucide-react';
import type { MmmDashboardData } from '@/lib/command-center/mmm/types';
import { Card } from './Section';
import { resolveTaskOwner } from '@/lib/command-center/mmm/registry';

export function NextActions({ actions }: { actions: MmmDashboardData['next_actions'] }) {
  if (actions.length === 0) {
    return (
      <Card>
        <div className="text-sm text-zinc-500">Nothing flagged. Plate&apos;s clear.</div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {actions.map((a, i) => {
        const owner = a.owner_id ? resolveTaskOwner(a.owner_id) : null;
        const urgent = a.tone === 'urgent';
        return (
          <div
            key={i}
            className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${
              urgent
                ? 'border-amber-500/30 bg-amber-500/[0.05]'
                : 'border-zinc-800 bg-zinc-950/40'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              {urgent ? (
                <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              ) : (
                <ArrowRight className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm text-zinc-200">{a.label}</div>
                {(owner || a.due_label) ? (
                  <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-2">
                    {owner ? <span>Owner: {owner.label}</span> : null}
                    {a.due_label ? <span>· Due: {a.due_label}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
