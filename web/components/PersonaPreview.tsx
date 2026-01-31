'use client';

import { PersonaData } from './PersonaCard';

interface PersonaPreviewProps {
  persona: PersonaData;
  onClose?: () => void;
  showHeader?: boolean;
}

export default function PersonaPreview({
  persona,
  onClose,
  showHeader = true,
}: PersonaPreviewProps) {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-6">
      <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  );

  const Tag = ({ children, color = 'zinc' }: { children: React.ReactNode; color?: string }) => {
    const colorClasses: Record<string, string> = {
      zinc: 'bg-zinc-800 text-zinc-300',
      violet: 'bg-violet-500/10 text-violet-400',
      blue: 'bg-blue-500/10 text-blue-400',
      emerald: 'bg-emerald-500/10 text-emerald-400',
      amber: 'bg-amber-500/10 text-amber-400',
      pink: 'bg-pink-500/10 text-pink-400',
      cyan: 'bg-cyan-500/10 text-cyan-400',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded ${colorClasses[color] || colorClasses.zinc}`}>
        {children}
      </span>
    );
  };

  const ListItem = ({ children, icon }: { children: React.ReactNode; icon?: string }) => (
    <li className="flex items-start gap-2 text-sm text-zinc-300">
      <span className="text-zinc-500 mt-0.5">{icon || '•'}</span>
      <span>{children}</span>
    </li>
  );

  return (
    <div className="bg-zinc-900/80 rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      {showHeader && (
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold">
              {persona.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <h3 className="font-semibold text-white">{persona.name}</h3>
              {persona.life_stage && (
                <span className="text-xs text-zinc-500">{persona.life_stage}</span>
              )}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      <div className="p-4 max-h-[60vh] overflow-y-auto">
        {/* Description */}
        {persona.description && (
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{persona.description}</p>
        )}

        {/* Demographics */}
        {(persona.age_range || persona.gender || persona.income_level || persona.location_type || persona.life_stage) && (
          <Section title="Demographics">
            <div className="flex flex-wrap gap-2">
              {persona.age_range && <Tag color="blue">{persona.age_range}</Tag>}
              {persona.gender && <Tag color="blue">{persona.gender}</Tag>}
              {persona.income_level && <Tag color="emerald">{persona.income_level}</Tag>}
              {persona.location_type && <Tag color="zinc">{persona.location_type}</Tag>}
              {persona.life_stage && <Tag color="violet">{persona.life_stage}</Tag>}
              {persona.lifestyle && <Tag color="cyan">{persona.lifestyle}</Tag>}
            </div>
          </Section>
        )}

        {/* Psychographics */}
        {(persona.values?.length || persona.interests?.length || persona.personality_traits?.length) && (
          <Section title="Psychographics">
            {persona.values && persona.values.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-zinc-500 mb-2">Values</div>
                <div className="flex flex-wrap gap-1.5">
                  {persona.values.map((v, i) => (
                    <Tag key={i} color="violet">{v}</Tag>
                  ))}
                </div>
              </div>
            )}
            {persona.interests && persona.interests.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-zinc-500 mb-2">Interests</div>
                <div className="flex flex-wrap gap-1.5">
                  {persona.interests.map((int, i) => (
                    <Tag key={i} color="cyan">{int}</Tag>
                  ))}
                </div>
              </div>
            )}
            {persona.personality_traits && persona.personality_traits.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">Personality</div>
                <div className="flex flex-wrap gap-1.5">
                  {persona.personality_traits.map((trait, i) => (
                    <Tag key={i} color="pink">{trait}</Tag>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Communication Style */}
        {(persona.tone_preference || persona.humor_style || persona.attention_span || persona.trust_builders?.length) && (
          <Section title="Communication Style">
            <div className="grid grid-cols-2 gap-4 mb-4">
              {persona.tone_preference && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Tone</div>
                  <div className="text-sm text-zinc-300">{persona.tone_preference}</div>
                </div>
              )}
              {persona.humor_style && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Humor</div>
                  <div className="text-sm text-zinc-300">{persona.humor_style}</div>
                </div>
              )}
              {persona.attention_span && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Attention</div>
                  <div className="text-sm text-zinc-300">{persona.attention_span}</div>
                </div>
              )}
            </div>

            {persona.trust_builders && persona.trust_builders.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-zinc-500 mb-2">What Builds Trust</div>
                <div className="flex flex-wrap gap-1.5">
                  {persona.trust_builders.map((tb, i) => (
                    <Tag key={i} color="emerald">{tb}</Tag>
                  ))}
                </div>
              </div>
            )}

            {persona.phrases_they_use && persona.phrases_they_use.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-zinc-500 mb-2">Phrases They Use</div>
                <div className="space-y-1">
                  {persona.phrases_they_use.slice(0, 3).map((phrase, i) => (
                    <div key={i} className="text-sm text-zinc-400 italic">&ldquo;{phrase}&rdquo;</div>
                  ))}
                </div>
              </div>
            )}

            {persona.phrases_to_avoid && persona.phrases_to_avoid.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">Phrases to Avoid</div>
                <div className="flex flex-wrap gap-1.5">
                  {persona.phrases_to_avoid.map((phrase, i) => (
                    <Tag key={i} color="amber">{phrase}</Tag>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Pain Points & Motivations */}
        {(persona.primary_pain_points?.length || persona.emotional_triggers?.length || persona.buying_objections?.length || persona.purchase_motivators?.length) && (
          <Section title="Pain Points & Motivations">
            <div className="grid gap-4">
              {persona.primary_pain_points && persona.primary_pain_points.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 mb-2 flex items-center gap-1">
                    <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Pain Points
                  </div>
                  <ul className="space-y-1.5">
                    {persona.primary_pain_points.map((pp, i) => (
                      <ListItem key={i} icon="!">{pp}</ListItem>
                    ))}
                  </ul>
                </div>
              )}

              {persona.emotional_triggers && persona.emotional_triggers.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Emotional Triggers</div>
                  <div className="flex flex-wrap gap-1.5">
                    {persona.emotional_triggers.map((trigger, i) => (
                      <Tag key={i} color="pink">{trigger}</Tag>
                    ))}
                  </div>
                </div>
              )}

              {persona.buying_objections && persona.buying_objections.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Buying Objections</div>
                  <ul className="space-y-1.5">
                    {persona.buying_objections.map((obj, i) => (
                      <ListItem key={i} icon="?">{obj}</ListItem>
                    ))}
                  </ul>
                </div>
              )}

              {persona.purchase_motivators && persona.purchase_motivators.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 mb-2">What Motivates Purchase</div>
                  <div className="flex flex-wrap gap-1.5">
                    {persona.purchase_motivators.map((mot, i) => (
                      <Tag key={i} color="emerald">{mot}</Tag>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Content Preferences */}
        {(persona.content_types_preferred?.length || persona.platforms?.length || persona.best_posting_times) && (
          <Section title="Content Preferences">
            {persona.platforms && persona.platforms.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-zinc-500 mb-2">Platforms</div>
                <div className="flex flex-wrap gap-1.5">
                  {persona.platforms.map((platform, i) => (
                    <Tag key={i} color="blue">{platform}</Tag>
                  ))}
                </div>
              </div>
            )}

            {persona.content_types_preferred && persona.content_types_preferred.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-zinc-500 mb-2">Content Types</div>
                <div className="flex flex-wrap gap-1.5">
                  {persona.content_types_preferred.map((type, i) => (
                    <Tag key={i} color="cyan">{type}</Tag>
                  ))}
                </div>
              </div>
            )}

            {persona.best_posting_times && (
              <div>
                <div className="text-xs text-zinc-500 mb-1">Best Posting Times</div>
                <div className="text-sm text-zinc-300">{persona.best_posting_times}</div>
              </div>
            )}
          </Section>
        )}

        {/* Usage Stats */}
        {persona.times_used != null && persona.times_used > 0 && (
          <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-500">
            <span>Used {persona.times_used} times</span>
            {persona.created_at && (
              <span>Created {new Date(persona.created_at).toLocaleDateString()}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
