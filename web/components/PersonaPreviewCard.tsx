'use client';

import PainPointSelector from './PainPointSelector';

interface PersonaData {
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
  // Communication Style
  tone?: string;
  tone_preference?: string;
  humor_style?: string;
  attention_span?: string;
  trust_builders?: string[];
  phrases_they_use?: string[];
  phrases_to_avoid?: string[];
  // Pain Points & Motivations
  pain_points?: Array<{ point: string; intensity?: string }>;
  primary_pain_points?: string[];
  emotional_triggers?: string[];
  buying_objections?: string[];
  purchase_motivators?: string[];
  common_objections?: string[];
  // Content Preferences
  content_they_engage_with?: string[];
  content_types_preferred?: string[];
  platforms?: string[];
  best_posting_times?: string;
  // Meta
  times_used?: number;
}

interface PersonaPreviewCardProps {
  persona: PersonaData;
  selectedPainPoints: string[];
  onPainPointsChange: (selected: string[]) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export default function PersonaPreviewCard({
  persona,
  selectedPainPoints,
  onPainPointsChange,
  expanded = false,
  onToggleExpand,
}: PersonaPreviewCardProps) {
  // Get pain points from either new or legacy format
  const painPoints = persona.primary_pain_points?.length
    ? persona.primary_pain_points
    : persona.pain_points?.map(p => p.point) || [];

  // Get objections from either new or legacy format
  const objections = persona.buying_objections?.length
    ? persona.buying_objections
    : persona.common_objections || [];

  // Get tone from either new or legacy format
  const tone = persona.tone_preference || persona.tone;

  // Build demographics string
  const demographics: string[] = [];
  if (persona.life_stage) demographics.push(persona.life_stage);
  if (persona.age_range) demographics.push(persona.age_range);
  if (persona.income_level) demographics.push(persona.income_level);

  return (
    <div className="bg-zinc-900/50 rounded-lg border border-white/10 overflow-hidden">
      {/* Header */}
      <div
        className="p-3 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-sm">
            {persona.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <div className="font-medium text-white text-sm">{persona.name}</div>
            {demographics.length > 0 && (
              <div className="text-xs text-zinc-500">{demographics.join(' • ')}</div>
            )}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-3 pt-0 space-y-4 border-t border-white/5">
          {/* Description */}
          {persona.description && (
            <p className="text-xs text-zinc-400 leading-relaxed">{persona.description}</p>
          )}

          {/* Communication Style Summary */}
          <div className="flex flex-wrap gap-1.5">
            {tone && (
              <span className="px-2 py-0.5 text-xs rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Tone: {tone}
              </span>
            )}
            {persona.humor_style && (
              <span className="px-2 py-0.5 text-xs rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                Humor: {persona.humor_style}
              </span>
            )}
            {persona.attention_span && (
              <span className="px-2 py-0.5 text-xs rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {persona.attention_span}
              </span>
            )}
          </div>

          {/* Pain Points Selection */}
          {painPoints.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1">
                <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Pain Points to Address
              </div>
              <PainPointSelector
                painPoints={painPoints}
                selected={selectedPainPoints}
                onChange={onPainPointsChange}
                maxSelect={2}
                autoOption={true}
              />
            </div>
          )}

          {/* Objections */}
          {objections.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-400 mb-1.5">Objections to Address</div>
              <div className="flex flex-wrap gap-1">
                {objections.slice(0, 3).map((obj, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400"
                  >
                    {obj.length > 40 ? obj.slice(0, 37) + '...' : obj}
                  </span>
                ))}
                {objections.length > 3 && (
                  <span className="px-2 py-0.5 text-xs text-zinc-500">
                    +{objections.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Trust Builders */}
          {persona.trust_builders && persona.trust_builders.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-400 mb-1.5">What Builds Trust</div>
              <div className="flex flex-wrap gap-1">
                {persona.trust_builders.map((tb, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-400"
                  >
                    {tb}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* What They Say */}
          {persona.phrases_they_use && persona.phrases_they_use.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-400 mb-1.5">Phrases They Use</div>
              <div className="text-xs text-zinc-500 italic">
                &ldquo;{persona.phrases_they_use[0]}&rdquo;
                {persona.phrases_they_use.length > 1 && (
                  <span className="text-zinc-600 not-italic ml-1">
                    +{persona.phrases_they_use.length - 1} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Tip */}
          <div className="pt-2 border-t border-white/5 text-xs text-zinc-500 flex items-start gap-2">
            <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span>
              This persona responds well to <strong className="text-zinc-400">{tone || 'casual'}</strong> tone
              {persona.humor_style && persona.humor_style !== 'none' && (
                <> with <strong className="text-zinc-400">{persona.humor_style}</strong> humor</>
              )}.
              {persona.attention_span && (
                <> They {persona.attention_span.toLowerCase()}.</>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
