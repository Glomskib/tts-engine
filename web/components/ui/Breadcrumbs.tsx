'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm mb-4">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1.5">
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />}
            {isLast || !item.href ? (
              <span className={isLast ? 'text-zinc-200 font-medium' : 'text-zinc-500'}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
