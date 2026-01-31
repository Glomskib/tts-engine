'use client';

import { useState } from 'react';

interface PainPointSelectorProps {
  painPoints: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  maxSelect?: number;
  autoOption?: boolean;
  disabled?: boolean;
}

export default function PainPointSelector({
  painPoints,
  selected,
  onChange,
  maxSelect = 2,
  autoOption = true,
  disabled = false,
}: PainPointSelectorProps) {
  const [showAll, setShowAll] = useState(false);

  const isAutoMode = selected.length === 0 && autoOption;
  const displayedPoints = showAll ? painPoints : painPoints.slice(0, 4);
  const hasMore = painPoints.length > 4;

  const togglePainPoint = (point: string) => {
    if (disabled) return;

    if (selected.includes(point)) {
      onChange(selected.filter(p => p !== point));
    } else if (selected.length < maxSelect) {
      onChange([...selected, point]);
    }
  };

  const clearSelection = () => {
    if (!disabled) {
      onChange([]);
    }
  };

  if (painPoints.length === 0) {
    return (
      <div className="text-xs text-zinc-500 italic py-2">
        No pain points defined for this persona
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Auto option */}
      {autoOption && (
        <button
          type="button"
          onClick={clearSelection}
          disabled={disabled}
          className={`
            px-3 py-1.5 text-xs rounded-lg border transition-all
            ${isAutoMode
              ? 'bg-violet-500/20 border-violet-500/50 text-violet-400'
              : 'bg-transparent border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title="Let AI choose the best pain point based on product fit"
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Auto (AI chooses best fit)
          </span>
        </button>
      )}

      {/* Pain point chips */}
      <div className="flex flex-wrap gap-1.5">
        {displayedPoints.map((point, idx) => {
          const isSelected = selected.includes(point);
          const canSelect = isSelected || selected.length < maxSelect;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => togglePainPoint(point)}
              disabled={disabled || (!isSelected && !canSelect)}
              className={`
                px-2.5 py-1 text-xs rounded-md border transition-all
                ${isSelected
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : canSelect
                    ? 'bg-transparent border-zinc-700 text-zinc-400 hover:border-amber-500/30 hover:text-amber-400/70'
                    : 'bg-transparent border-zinc-800 text-zinc-600 cursor-not-allowed'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title={isSelected ? 'Click to deselect' : canSelect ? 'Focus script on this pain point' : `Max ${maxSelect} selections`}
            >
              <span className="flex items-center gap-1">
                {isSelected && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {point.length > 50 ? point.slice(0, 47) + '...' : point}
              </span>
            </button>
          );
        })}
      </div>

      {/* Show more/less */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
        >
          {showAll ? 'Show less' : `+${painPoints.length - 4} more pain points`}
        </button>
      )}

      {/* Selection hint */}
      {selected.length > 0 && (
        <div className="text-xs text-amber-400/70 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          Script will address {selected.length === 1 ? 'this pain point' : 'these pain points'} in the hook
        </div>
      )}
    </div>
  );
}
