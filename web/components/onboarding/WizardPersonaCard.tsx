'use client';

import type { Persona } from '@/lib/personas';

interface WizardPersonaCardProps {
  persona: Persona;
  selected: boolean;
  onToggle: (id: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  lifestyle: 'bg-pink-500',
  tech: 'bg-teal-500',
  comedy: 'bg-amber-500',
  educational: 'bg-emerald-500',
  beauty: 'bg-fuchsia-500',
  luxury: 'bg-violet-500',
};

export default function WizardPersonaCard({ persona, selected, onToggle }: WizardPersonaCardProps) {
  const avatarColor = CATEGORY_COLORS[persona.category] || 'bg-zinc-500';
  const initial = persona.name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onToggle(persona.id)}
      className={`w-full text-left p-3 rounded-xl border transition-all min-h-[52px] ${
        selected
          ? 'border-teal-500 bg-teal-500/10'
          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-full ${avatarColor} flex items-center justify-center shrink-0`}>
          <span className="text-sm font-bold text-white">{initial}</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Name */}
          <p className={`text-sm font-semibold leading-tight ${selected ? 'text-teal-300' : 'text-white'}`}>
            {persona.name}
          </p>
          {/* Description */}
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2 leading-snug">
            {persona.description}
          </p>
          {/* Tone pill */}
          <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
            selected
              ? 'bg-teal-500/20 text-teal-400'
              : 'bg-zinc-700 text-zinc-400'
          }`}>
            {persona.tone}
          </span>
        </div>
      </div>
    </button>
  );
}
