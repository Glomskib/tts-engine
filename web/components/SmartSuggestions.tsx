'use client';

import { useState, useEffect } from 'react';

interface Suggestion {
  id: string;
  type: 'hook' | 'beat' | 'cta' | 'style' | 'persona';
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
}

interface SmartSuggestionsProps {
  context: 'generator' | 'library' | 'editing';
  productName?: string;
  personaId?: string;
  currentHook?: string;
  onApplySuggestion?: (suggestion: Suggestion) => void;
  className?: string;
}

// Sample suggestions based on context
const GENERATOR_SUGGESTIONS: Suggestion[] = [
  {
    id: 'trending-hook',
    type: 'hook',
    title: 'Use a trending hook format',
    description: 'POV-style hooks are performing 40% better this week',
    actionLabel: 'Apply',
  },
  {
    id: 'high-energy',
    type: 'style',
    title: 'Try higher intensity',
    description: 'High-energy scripts get 2x more engagement for this product type',
    actionLabel: 'Boost',
  },
  {
    id: 'add-urgency',
    type: 'cta',
    title: 'Add urgency to CTA',
    description: 'Limited-time framing increases click-through by 25%',
    actionLabel: 'Apply',
  },
];

const EDITING_SUGGESTIONS: Suggestion[] = [
  {
    id: 'shorten-beat',
    type: 'beat',
    title: 'Beat 3 is too long',
    description: 'Consider splitting or shortening to under 5 seconds',
    actionLabel: 'Auto-fix',
  },
  {
    id: 'weak-hook',
    type: 'hook',
    title: 'Hook could be stronger',
    description: 'Add a pattern interrupt or bold claim to the opening',
    actionLabel: 'Suggest',
  },
  {
    id: 'missing-broll',
    type: 'style',
    title: 'Add B-roll opportunities',
    description: 'Product demos work well after beat 2',
    actionLabel: 'Add',
  },
];

const LIBRARY_SUGGESTIONS: Suggestion[] = [
  {
    id: 'remix-winner',
    type: 'style',
    title: 'Remix a top performer',
    description: 'Your "Before/After" scripts have highest engagement',
    actionLabel: 'View',
  },
  {
    id: 'underused-persona',
    type: 'persona',
    title: 'Try a different persona',
    description: 'You haven\'t used "Skeptic" recently - it performs well',
    actionLabel: 'Use',
  },
  {
    id: 'seasonal-trend',
    type: 'hook',
    title: 'Seasonal opportunity',
    description: 'Create content for upcoming holiday trends',
    actionLabel: 'Start',
  },
];

export default function SmartSuggestions({
  context,
  productName,
  personaId,
  onApplySuggestion,
  className = '',
}: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Simulate loading suggestions
    setLoading(true);
    const timer = setTimeout(() => {
      let baseSuggestions: Suggestion[];
      switch (context) {
        case 'generator':
          baseSuggestions = GENERATOR_SUGGESTIONS;
          break;
        case 'editing':
          baseSuggestions = EDITING_SUGGESTIONS;
          break;
        case 'library':
          baseSuggestions = LIBRARY_SUGGESTIONS;
          break;
        default:
          baseSuggestions = [];
      }
      setSuggestions(baseSuggestions);
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [context, productName, personaId]);

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  const handleApply = (suggestion: Suggestion) => {
    onApplySuggestion?.(suggestion);
    handleDismiss(suggestion.id);
  };

  const visibleSuggestions = suggestions.filter(s => !dismissed.has(s.id));

  const getTypeIcon = (type: Suggestion['type']) => {
    switch (type) {
      case 'hook':
        return 'M13 10V3L4 14h7v7l9-11h-7z';
      case 'beat':
        return 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3';
      case 'cta':
        return 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122';
      case 'style':
        return 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01';
      case 'persona':
        return 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z';
      default:
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  };

  const getTypeColor = (type: Suggestion['type']) => {
    switch (type) {
      case 'hook':
        return 'text-amber-400 bg-amber-500/20';
      case 'beat':
        return 'text-teal-400 bg-teal-500/20';
      case 'cta':
        return 'text-emerald-400 bg-emerald-500/20';
      case 'style':
        return 'text-violet-400 bg-violet-500/20';
      case 'persona':
        return 'text-pink-400 bg-pink-500/20';
      default:
        return 'text-zinc-400 bg-zinc-500/20';
    }
  };

  if (loading) {
    return (
      <div className={`p-4 rounded-xl border border-white/10 bg-zinc-900/50 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded bg-zinc-800 animate-pulse" />
          <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (visibleSuggestions.length === 0) {
    return null;
  }

  return (
    <div className={`p-4 rounded-xl border border-white/10 bg-zinc-900/50 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span className="text-sm font-medium text-zinc-300">Smart Suggestions</span>
        <span className="text-xs text-zinc-500">({visibleSuggestions.length})</span>
      </div>

      <div className="space-y-2">
        {visibleSuggestions.map(suggestion => {
          const colors = getTypeColor(suggestion.type);
          return (
            <div
              key={suggestion.id}
              className="p-3 rounded-lg bg-zinc-800/50 border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colors}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getTypeIcon(suggestion.type)} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200">{suggestion.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{suggestion.description}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {suggestion.actionLabel && (
                    <button type="button"
                      onClick={() => handleApply(suggestion)}
                      className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded text-xs transition-colors"
                    >
                      {suggestion.actionLabel}
                    </button>
                  )}
                  <button type="button"
                    onClick={() => handleDismiss(suggestion.id)}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Dismiss"
                    aria-label="Dismiss suggestion"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Inline suggestion tooltip for specific elements
interface InlineSuggestionProps {
  suggestion: string;
  onApply?: () => void;
  onDismiss?: () => void;
}

export function InlineSuggestion({ suggestion, onApply, onDismiss }: InlineSuggestionProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
      <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-amber-200 flex-1">{suggestion}</span>
      {onApply && (
        <button type="button"
          onClick={onApply}
          className="text-xs text-amber-400 hover:text-amber-300 font-medium"
        >
          Apply
        </button>
      )}
      <button type="button"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
        className="text-amber-500 hover:text-amber-400"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
