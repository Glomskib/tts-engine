'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Grid, Heart, Cpu, Sparkles, Briefcase, Dumbbell, Laugh, ChefHat, Plane, Hammer, Crown, GraduationCap } from 'lucide-react';
import { PERSONAS } from '@/lib/personas';
import { PERSONA_CATEGORIES, type PersonaCategoryId } from '@/lib/persona-categories';

// Icon mapping for categories
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Grid,
  Heart,
  Cpu,
  Sparkles,
  Briefcase,
  Dumbbell,
  Laugh,
  ChefHat,
  Plane,
  Hammer,
  Crown,
  GraduationCap,
  PiggyBank: Briefcase, // Fallback for PiggyBank
};

interface PersonaSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function PersonaSelector({ value, onChange, className }: PersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PersonaCategoryId>('all');
  const ref = useRef<HTMLDivElement>(null);
  const selected = PERSONAS.find(p => p.id === value);

  // Filter personas by category
  const filteredPersonas = useMemo(() => {
    if (selectedCategory === 'all') return PERSONAS;
    return PERSONAS.filter(p => p.category === selectedCategory);
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

  return (
    <div ref={ref} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full min-h-[48px] px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-left flex items-center justify-between text-white hover:border-zinc-600 transition-colors"
      >
        {selected ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {selected.name[0]}
            </div>
            <div className="min-w-0 truncate">
              <span className="font-medium">{selected.name}</span>
              <span className="text-zinc-500 ml-1">({selected.age})</span>
              <span className="text-zinc-400 ml-2 hidden sm:inline">- {selected.description}</span>
            </div>
          </div>
        ) : (
          <span className="text-zinc-500">Select a character persona...</span>
        )}
        <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform flex-shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-[420px] overflow-hidden flex flex-col">
          {/* Category Filter Tabs */}
          <div className="flex gap-1 p-2 border-b border-zinc-800 overflow-x-auto flex-shrink-0 scrollbar-hide">
            {PERSONA_CATEGORIES.map((category) => {
              const IconComponent = CATEGORY_ICONS[category.icon] || Grid;
              const isSelected = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCategory(category.id);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    isSelected
                      ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 border border-transparent'
                  }`}
                  title={category.name}
                >
                  <IconComponent className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{category.name}</span>
                </button>
              );
            })}
          </div>

          {/* Persona List */}
          <div className="overflow-y-auto flex-1">
            {/* Clear option */}
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="w-full px-4 py-3 text-left hover:bg-zinc-800 border-b border-zinc-800 transition-colors text-zinc-500"
            >
              No specific persona
            </button>

            {filteredPersonas.length === 0 ? (
              <div className="px-4 py-6 text-center text-zinc-500 text-sm">
                No personas in this category
              </div>
            ) : (
              filteredPersonas.map((persona) => (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => {
                    onChange(persona.id);
                    setOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-zinc-800 border-b border-zinc-800 last:border-0 transition-colors ${
                    value === persona.id ? 'bg-teal-500/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {persona.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white">
                          {persona.name} <span className="text-zinc-500">({persona.age})</span>
                        </p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 capitalize">
                          {persona.category}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400 truncate">{persona.description}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer showing count */}
          <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex-shrink-0">
            {filteredPersonas.length} persona{filteredPersonas.length !== 1 ? 's' : ''} {selectedCategory !== 'all' ? `in ${selectedCategory}` : 'available'}
          </div>
        </div>
      )}
    </div>
  );
}
