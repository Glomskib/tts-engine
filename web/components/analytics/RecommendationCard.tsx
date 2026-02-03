'use client';

import { CheckCircle, Lightbulb, AlertTriangle } from 'lucide-react';
import type { Recommendation } from '@/lib/analytics/types';

interface RecommendationCardProps {
  recommendations: Recommendation[];
}

function getRecommendationStyles(type: Recommendation['type']) {
  switch (type) {
    case 'keep_doing':
      return {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        iconBg: 'bg-emerald-500/20',
        iconColor: 'text-emerald-400',
        Icon: CheckCircle,
      };
    case 'try_more':
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        iconBg: 'bg-amber-500/20',
        iconColor: 'text-amber-400',
        Icon: Lightbulb,
      };
    case 'avoid':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        iconBg: 'bg-red-500/20',
        iconColor: 'text-red-400',
        Icon: AlertTriangle,
      };
    default:
      return {
        bg: 'bg-zinc-500/10',
        border: 'border-zinc-500/20',
        iconBg: 'bg-zinc-500/20',
        iconColor: 'text-zinc-400',
        Icon: Lightbulb,
      };
  }
}

function getConfidenceDots(confidence: Recommendation['confidence']) {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

export function RecommendationCard({ recommendations }: RecommendationCardProps) {
  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          AI Recommendations
        </h3>
        <p className="text-sm text-zinc-500 text-center py-4">
          Need more winners data to generate recommendations
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
        <Lightbulb className="w-4 h-4" />
        AI Recommendations
      </h3>

      <div className="space-y-3">
        {recommendations.map((rec, index) => {
          const styles = getRecommendationStyles(rec.type);
          const confidenceDots = getConfidenceDots(rec.confidence);

          return (
            <div
              key={index}
              className={`p-3 rounded-lg border ${styles.bg} ${styles.border}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg ${styles.iconBg} flex items-center justify-center flex-shrink-0`}
                >
                  <styles.Icon className={`w-4 h-4 ${styles.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-medium text-white truncate">
                      {rec.title}
                    </h4>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {[1, 2, 3].map((dot) => (
                        <div
                          key={dot}
                          className={`w-1.5 h-1.5 rounded-full ${
                            dot <= confidenceDots
                              ? styles.iconColor.replace('text-', 'bg-')
                              : 'bg-zinc-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {rec.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RecommendationCard;
