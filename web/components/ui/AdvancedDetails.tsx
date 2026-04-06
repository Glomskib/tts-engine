'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Settings } from 'lucide-react';

interface AdvancedDetailsProps {
  children: ReactNode;
  title?: string;
  /** Start expanded */
  defaultOpen?: boolean;
}

/**
 * Collapsible section for admin/debug/advanced information.
 * Hidden by default to keep the UI clean for normal users.
 */
export function AdvancedDetails({ children, title = 'Advanced Details', defaultOpen = false }: AdvancedDetailsProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-xs font-medium text-zinc-500 hover:text-zinc-400 hover:bg-zinc-900/50 transition-colors"
      >
        <Settings className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1">{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-zinc-800">
          {children}
        </div>
      )}
    </div>
  );
}
