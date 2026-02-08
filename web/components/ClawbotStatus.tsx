'use client';

import { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';

interface ClawbotStatusProps {
  compact?: boolean;
}

export function ClawbotStatus({ compact }: ClawbotStatusProps) {
  const [patternCount, setPatternCount] = useState<number | null>(null);
  const [suppressedCount, setSuppressedCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/clawbot/summaries/latest', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const summary = data.summary;
        if (!summary) return;

        const patterns = summary.winning_patterns?.length ?? 0;
        const suppressed = summary.suppression_rules?.length ?? 0;
        setPatternCount(patterns);
        setSuppressedCount(suppressed);
      } catch {
        // Non-critical — hide component on failure
      }
    };
    fetchSummary();
  }, []);

  // Don't render if no data available
  if (patternCount === null) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 ${
        compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
      }`}
      title="Clawbot learning status"
    >
      <Bot className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      <span>{patternCount} pattern{patternCount !== 1 ? 's' : ''}</span>
      {(suppressedCount ?? 0) > 0 && (
        <>
          <span className="text-purple-500/50">·</span>
          <span>{suppressedCount} suppressed</span>
        </>
      )}
    </div>
  );
}
