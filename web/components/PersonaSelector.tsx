'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { PERSONAS } from '@/lib/personas';

interface PersonaSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function PersonaSelector({ value, onChange, className }: PersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = PERSONAS.find(p => p.id === value);

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
        <div className="absolute z-50 w-full mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
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

          {PERSONAS.map((persona) => (
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
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {persona.name} <span className="text-zinc-500">({persona.age})</span>
                  </p>
                  <p className="text-sm text-zinc-400 truncate">{persona.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
