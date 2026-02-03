'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Laugh, Sparkles, Heart, TrendingUp, GraduationCap, User } from 'lucide-react';
import {
  CREATOR_PERSONAS,
  getPersonaCategories,
  type CreatorPersona,
} from '@/lib/ai/creatorPersonas';

// Icon mapping for categories
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  comedy: Laugh,
  lifestyle: Sparkles,
  authentic: Heart,
  trendy: TrendingUp,
  educational: GraduationCap,
};

// Color mapping for categories
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  comedy: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  lifestyle: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  authentic: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  trendy: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  educational: { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30' },
};

interface CreatorPersonaSelectorProps {
  value: string | null;
  onChange: (personaId: string | null) => void;
  className?: string;
  compact?: boolean;
}

export function CreatorPersonaSelector({ value, onChange, className, compact }: CreatorPersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [hoveredPersona, setHoveredPersona] = useState<CreatorPersona | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const selected = value ? CREATOR_PERSONAS.find(p => p.id === value) : null;
  const categories = getPersonaCategories();

  // Filter personas by category
  const filteredPersonas = useMemo(() => {
    if (selectedCategory === 'all') return CREATOR_PERSONAS;
    return CREATOR_PERSONAS.filter(p => p.category === selectedCategory);
  }, [selectedCategory]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayPersona = hoveredPersona || selected;

  return (
    <div ref={ref} className={`relative ${className || ''}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full min-h-[48px] px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-left flex items-center justify-between text-white hover:border-zinc-600 transition-colors"
      >
        {selected ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${CATEGORY_COLORS[selected.category]?.bg || 'bg-zinc-700'}`}>
              {(() => {
                const Icon = CATEGORY_ICONS[selected.category] || User;
                return <Icon className={`w-4 h-4 ${CATEGORY_COLORS[selected.category]?.text || 'text-zinc-400'}`} />;
              })()}
            </div>
            <div className="min-w-0 truncate">
              <span className="font-medium">{selected.name}</span>
              {!compact && (
                <span className="text-zinc-400 ml-2 hidden sm:inline">- {selected.oneLineBio}</span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-zinc-500">Select a creator persona...</span>
        )}
        <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform flex-shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '520px' }}>
          {/* Category Tabs */}
          <div className="flex gap-1 p-2 border-b border-zinc-800 overflow-x-auto flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCategory('all');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 border border-transparent'
              }`}
            >
              All ({CREATOR_PERSONAS.length})
            </button>
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.category] || User;
              const colors = CATEGORY_COLORS[cat.category];
              const isSelected = selectedCategory === cat.category;
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCategory(cat.category);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    isSelected
                      ? `${colors.bg} ${colors.text} border ${colors.border}`
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{cat.label.split(' ')[0]}</span>
                  <span className="text-[10px] opacity-60">({cat.count})</span>
                </button>
              );
            })}
          </div>

          {/* Content Area */}
          <div className="flex flex-1 overflow-hidden">
            {/* Persona List */}
            <div className="w-1/2 overflow-y-auto border-r border-zinc-800">
              {/* Clear option */}
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-zinc-800 border-b border-zinc-800 transition-colors text-zinc-500"
              >
                No specific persona
              </button>

              {filteredPersonas.map((persona) => {
                const colors = CATEGORY_COLORS[persona.category];
                return (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => {
                      onChange(persona.id);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHoveredPersona(persona)}
                    onMouseLeave={() => setHoveredPersona(null)}
                    className={`w-full px-4 py-3 text-left hover:bg-zinc-800 border-b border-zinc-800 last:border-0 transition-colors ${
                      value === persona.id ? 'bg-teal-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
                        {(() => {
                          const Icon = CATEGORY_ICONS[persona.category] || User;
                          return <Icon className={`w-4 h-4 ${colors.text}`} />;
                        })()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white text-sm">{persona.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{persona.oneLineBio}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Preview Panel */}
            <div className="w-1/2 p-4 overflow-y-auto bg-zinc-800/30">
              {displayPersona ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white">{displayPersona.name}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[displayPersona.category]?.bg} ${CATEGORY_COLORS[displayPersona.category]?.text}`}>
                        {displayPersona.category}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400">{displayPersona.oneLineBio}</p>
                  </div>

                  {/* Energy Range */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Energy Range</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-zinc-700 rounded text-zinc-300">{displayPersona.energyRange.min}</span>
                      <span className="text-zinc-500">to</span>
                      <span className="text-xs px-2 py-1 bg-zinc-700 rounded text-zinc-300">{displayPersona.energyRange.max}</span>
                    </div>
                  </div>

                  {/* Signature Patterns */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Signature Patterns</p>
                    <ul className="space-y-1">
                      {displayPersona.signaturePatterns.slice(0, 3).map((pattern, i) => (
                        <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                          <span className="text-teal-400 mt-0.5">-</span>
                          {pattern}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Dialogue Style */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Dialogue Tone</p>
                    <p className="text-xs text-zinc-300">{displayPersona.dialogueStyle.tone}</p>
                  </div>

                  {/* Catchphrases */}
                  {displayPersona.dialogueStyle.catchphrases.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Catchphrases</p>
                      <div className="flex flex-wrap gap-1">
                        {displayPersona.dialogueStyle.catchphrases.slice(0, 3).map((phrase, i) => (
                          <span key={i} className="text-[10px] px-2 py-1 bg-zinc-700 rounded text-zinc-300">
                            &quot;{phrase}&quot;
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Best For */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Best For</p>
                    <div className="flex flex-wrap gap-1">
                      {displayPersona.bestFor.slice(0, 4).map((item, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 bg-teal-500/20 text-teal-400 rounded">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                  Hover over a persona to preview
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex-shrink-0 flex justify-between">
            <span>{filteredPersonas.length} persona{filteredPersonas.length !== 1 ? 's' : ''}</span>
            <span className="text-teal-400">Hover for details</span>
          </div>
        </div>
      )}
    </div>
  );
}
