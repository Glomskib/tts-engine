'use client';

import { useState, useEffect } from 'react';
import {
  loadSavedInitiative,
  saveInitiativeChoice,
  fetchInitiatives,
} from '@/lib/command-center/use-initiative-filter';
import type { InitiativeOption } from '@/lib/command-center/use-initiative-filter';

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export default function InitiativeFilter({ value, onChange }: Props) {
  const [options, setOptions] = useState<InitiativeOption[]>([]);

  useEffect(() => {
    fetchInitiatives().then(setOptions);
  }, []);

  // On mount, restore saved choice if caller hasn't set one
  useEffect(() => {
    if (!value) {
      const saved = loadSavedInitiative();
      if (saved) onChange(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(id: string) {
    saveInitiativeChoice(id);
    onChange(id);
  }

  if (options.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm"
    >
      <option value="">All initiatives</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.title}
        </option>
      ))}
    </select>
  );
}
