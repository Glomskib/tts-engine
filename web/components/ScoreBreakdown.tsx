'use client';

import { useState } from 'react';

interface ScoreCategory {
  name: string;
  score: number;
  maxScore: number;
  description: string;
  tips?: string[];
}

interface ScoreBreakdownProps {
  overallScore: number;
  hookStrength?: number;
  viralityPotential?: number;
  structureScore?: number;
  ctaEffectiveness?: number;
  className?: string;
}

const SCORE_COLORS = {
  excellent: 'text-emerald-400 bg-emerald-500/20',
  good: 'text-teal-400 bg-teal-500/20',
  average: 'text-amber-400 bg-amber-500/20',
  poor: 'text-red-400 bg-red-500/20',
};

const getScoreLevel = (score: number): keyof typeof SCORE_COLORS => {
  if (score >= 8) return 'excellent';
  if (score >= 6) return 'good';
  if (score >= 4) return 'average';
  return 'poor';
};

const getScoreLabel = (level: keyof typeof SCORE_COLORS): string => {
  switch (level) {
    case 'excellent': return 'Excellent';
    case 'good': return 'Good';
    case 'average': return 'Needs Work';
    case 'poor': return 'Weak';
  }
};

export default function ScoreBreakdown({
  overallScore,
  hookStrength = 0,
  viralityPotential = 0,
  structureScore = 0,
  ctaEffectiveness = 0,
  className = '',
}: ScoreBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  const categories: ScoreCategory[] = [
    {
      name: 'Hook Strength',
      score: hookStrength,
      maxScore: 10,
      description: 'How effectively the opening captures attention',
      tips: hookStrength < 7 ? [
        'Start with a bold claim or question',
        'Use pattern interrupts',
        'Create immediate curiosity',
      ] : undefined,
    },
    {
      name: 'Virality Potential',
      score: viralityPotential,
      maxScore: 10,
      description: 'Likelihood of shares and engagement',
      tips: viralityPotential < 7 ? [
        'Add relatable moments',
        'Include shareable quotes',
        'Create emotional peaks',
      ] : undefined,
    },
    {
      name: 'Structure',
      score: structureScore,
      maxScore: 10,
      description: 'Flow and pacing of the script',
      tips: structureScore < 7 ? [
        'Keep beats under 5 seconds each',
        'Build to a clear climax',
        'Ensure smooth transitions',
      ] : undefined,
    },
    {
      name: 'CTA Effectiveness',
      score: ctaEffectiveness,
      maxScore: 10,
      description: 'Strength of the call-to-action',
      tips: ctaEffectiveness < 7 ? [
        'Make the action specific',
        'Add urgency or scarcity',
        'Connect CTA to viewer benefit',
      ] : undefined,
    },
  ];

  const overallLevel = getScoreLevel(overallScore);
  const overallColors = SCORE_COLORS[overallLevel];

  return (
    <div className={`rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden ${className}`}>
      {/* Overall Score Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${overallColors}`}>
            <span className="text-2xl font-bold">{overallScore}</span>
          </div>
          <div>
            <div className="font-semibold text-white">AI Quality Score</div>
            <div className={`text-sm ${overallColors.split(' ')[0]}`}>
              {getScoreLabel(overallLevel)}
            </div>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-white/10 p-4 space-y-4">
          {/* Score bars */}
          {categories.map(category => {
            const level = getScoreLevel(category.score);
            const colors = SCORE_COLORS[level];
            const percentage = (category.score / category.maxScore) * 100;

            return (
              <div key={category.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-zinc-300">{category.name}</span>
                  <span className={`text-sm font-medium ${colors.split(' ')[0]}`}>
                    {category.score}/{category.maxScore}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${colors.replace('text-', 'bg-').replace('/20', '')}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">{category.description}</p>

                {/* Tips for improvement */}
                {category.tips && (
                  <div className="mt-2 pl-3 border-l-2 border-zinc-700">
                    <p className="text-xs text-zinc-400 mb-1">Tips to improve:</p>
                    <ul className="text-xs text-zinc-500 space-y-0.5">
                      {category.tips.map((tip, i) => (
                        <li key={i}>• {tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {/* Overall insights */}
          <div className="pt-4 border-t border-white/10">
            <h4 className="text-sm font-medium text-zinc-300 mb-2">Score Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-zinc-800/50">
                <span className="text-zinc-500">Strongest:</span>
                <span className="ml-2 text-zinc-300">
                  {categories.reduce((a, b) => a.score > b.score ? a : b).name}
                </span>
              </div>
              <div className="p-2 rounded bg-zinc-800/50">
                <span className="text-zinc-500">Needs work:</span>
                <span className="ml-2 text-zinc-300">
                  {categories.reduce((a, b) => a.score < b.score ? a : b).name}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact inline score badge
interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ScoreBadge({ score, size = 'md', showLabel = false }: ScoreBadgeProps) {
  const level = getScoreLevel(score);
  const colors = SCORE_COLORS[level];

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`rounded-lg flex items-center justify-center font-bold ${sizeClasses[size]} ${colors}`}>
        {score}
      </div>
      {showLabel && (
        <span className={`text-sm ${colors.split(' ')[0]}`}>
          {getScoreLabel(level)}
        </span>
      )}
    </div>
  );
}

// Score comparison component
interface ScoreCompareProps {
  beforeScore: number;
  afterScore: number;
}

export function ScoreCompare({ beforeScore, afterScore }: ScoreCompareProps) {
  const diff = afterScore - beforeScore;
  const improved = diff > 0;

  return (
    <div className="flex items-center gap-2">
      <ScoreBadge score={beforeScore} size="sm" />
      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
      <ScoreBadge score={afterScore} size="sm" />
      <span className={`text-sm font-medium ${improved ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
        {improved ? '+' : ''}{diff.toFixed(1)}
      </span>
    </div>
  );
}
