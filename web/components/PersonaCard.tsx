'use client';

import { useState } from 'react';

export interface PersonaData {
  id: string;
  name: string;
  description?: string;
  // Demographics
  age_range?: string;
  gender?: string;
  income_level?: string;
  location_type?: string;
  life_stage?: string;
  lifestyle?: string;
  // Psychographics
  values?: string[];
  interests?: string[];
  personality_traits?: string[];
  // Communication
  tone_preference?: string;
  humor_style?: string;
  attention_span?: string;
  trust_builders?: string[];
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  // Pain Points & Motivations
  primary_pain_points?: string[];
  emotional_triggers?: string[];
  buying_objections?: string[];
  purchase_motivators?: string[];
  common_objections?: string[];
  // Content
  content_types_preferred?: string[];
  platforms?: string[];
  best_posting_times?: string;
  // Meta
  avatar_type?: string;
  times_used?: number;
  created_at?: string;
}

interface PersonaCardProps {
  persona: PersonaData;
  selected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  compact?: boolean;
  className?: string;
}

const AVATAR_COLORS: Record<string, string> = {
  'stressed-mom': 'bg-pink-500/20 text-pink-400',
  'busy-professional': 'bg-blue-500/20 text-blue-400',
  'health-conscious': 'bg-emerald-500/20 text-emerald-400',
  'skeptical-buyer': 'bg-amber-500/20 text-amber-400',
  'budget-conscious': 'bg-violet-500/20 text-violet-400',
  'trend-follower': 'bg-cyan-500/20 text-cyan-400',
  default: 'bg-zinc-500/20 text-zinc-400',
};

export default function PersonaCard({
  persona,
  selected = false,
  onClick,
  onEdit,
  compact = false,
  className = '',
}: PersonaCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = () => {
    const key = persona.avatar_type || persona.name.toLowerCase().replace(/\s+/g, '-');
    return AVATAR_COLORS[key] || AVATAR_COLORS.default;
  };

  // Get the most relevant pain points (prefer primary_pain_points, fallback to old format)
  const painPoints = persona.primary_pain_points?.length
    ? persona.primary_pain_points
    : persona.common_objections || [];

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`p-3 rounded-lg border transition-all cursor-pointer ${
          selected
            ? 'border-violet-500 bg-violet-500/10'
            : 'border-white/10 bg-zinc-800/50 hover:border-white/20'
        } ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${getAvatarColor()}`}>
            {getInitials(persona.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-white truncate">{persona.name}</div>
            {persona.life_stage && (
              <div className="text-xs text-zinc-500">{persona.life_stage}</div>
            )}
          </div>
          {persona.times_used != null && persona.times_used > 0 && (
            <span className="text-xs text-zinc-500">{persona.times_used}x</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border transition-all ${
        selected
          ? 'border-violet-500 bg-violet-500/5'
          : 'border-white/10 bg-zinc-900/50 hover:border-white/20'
      } ${className}`}
    >
      {/* Header */}
      <div
        onClick={onClick}
        className="p-4 cursor-pointer"
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${getAvatarColor()}`}>
            {getInitials(persona.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-white truncate">{persona.name}</h3>
              {persona.times_used != null && persona.times_used > 0 && (
                <span className="text-xs text-zinc-500 flex-shrink-0">Used {persona.times_used}x</span>
              )}
            </div>

            {persona.description && (
              <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{persona.description}</p>
            )}

            {/* Quick badges */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {persona.life_stage && (
                <span className="px-2 py-0.5 text-xs rounded bg-blue-500/10 text-blue-400">
                  {persona.life_stage}
                </span>
              )}
              {persona.income_level && (
                <span className="px-2 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-400">
                  {persona.income_level}
                </span>
              )}
              {persona.tone_preference && (
                <span className="px-2 py-0.5 text-xs rounded bg-violet-500/10 text-violet-400">
                  {persona.tone_preference}
                </span>
              )}
              {painPoints.length > 0 && (
                <span className="px-2 py-0.5 text-xs rounded bg-amber-500/10 text-amber-400">
                  {painPoints.length} pain points
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expandable details */}
      {!compact && (
        <>
          <div className="px-4 pb-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              <svg
                className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {expanded ? 'Less details' : 'More details'}
            </button>
          </div>

          {expanded && (
            <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-4">
              {/* Demographics */}
              {(persona.age_range || persona.gender || persona.location_type) && (
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Demographics</div>
                  <div className="flex flex-wrap gap-2 text-sm text-zinc-300">
                    {persona.age_range && <span>{persona.age_range}</span>}
                    {persona.gender && <span>· {persona.gender}</span>}
                    {persona.location_type && <span>· {persona.location_type}</span>}
                  </div>
                </div>
              )}

              {/* Values & Interests */}
              {(persona.values?.length || persona.interests?.length) && (
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Values & Interests</div>
                  <div className="flex flex-wrap gap-1.5">
                    {persona.values?.map((v, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-300">
                        {v}
                      </span>
                    ))}
                    {persona.interests?.map((int, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded bg-zinc-800/50 text-zinc-400">
                        {int}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pain Points */}
              {painPoints.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Pain Points</div>
                  <ul className="text-sm text-zinc-400 space-y-1">
                    {painPoints.slice(0, 3).map((pp, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-400">•</span>
                        {pp}
                      </li>
                    ))}
                    {painPoints.length > 3 && (
                      <li className="text-xs text-zinc-500">+{painPoints.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Communication Style */}
              {(persona.phrases_they_use?.length || persona.trust_builders?.length) && (
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Communication</div>
                  {persona.phrases_they_use && persona.phrases_they_use.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs text-zinc-500 mb-1">They say:</div>
                      <div className="text-sm text-zinc-300 italic">
                        &ldquo;{persona.phrases_they_use[0]}&rdquo;
                      </div>
                    </div>
                  )}
                  {persona.trust_builders && persona.trust_builders.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {persona.trust_builders.map((tb, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-400">
                          {tb}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Edit button */}
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="w-full py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Edit Persona
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
