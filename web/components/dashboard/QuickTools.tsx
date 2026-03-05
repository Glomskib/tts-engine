'use client';

import Link from 'next/link';
import {
  Sparkles, Video, Upload, FileText, Package,
} from 'lucide-react';

const QUICK_TOOLS = [
  { label: 'Create Content', href: '/admin/content-studio', icon: Sparkles, color: 'text-teal-400' },
  { label: 'Pipeline', href: '/admin/pipeline', icon: Video, color: 'text-amber-400' },
  { label: 'Transcriber', href: '/admin/transcribe', icon: FileText, color: 'text-purple-400' },
  { label: 'Products', href: '/admin/products', icon: Package, color: 'text-blue-400' },
];

export function QuickTools() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">Quick Tools</h2>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {QUICK_TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-3 min-h-[48px] bg-zinc-900/50 border border-white/10 rounded-xl hover:bg-zinc-800/50 transition-colors"
            >
              <Icon className={`w-4 h-4 ${tool.color}`} />
              <span className="text-sm text-white font-medium whitespace-nowrap">{tool.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
