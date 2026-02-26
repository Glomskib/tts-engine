import { ReactNode } from 'react';

interface CCSectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export default function CCSection({
  title,
  description,
  actions,
  children,
  className = '',
  padding = true,
}: CCSectionProps) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/50 ${className}`}>
      {(title || actions) && (
        <div className={`flex items-center justify-between gap-3 border-b border-zinc-800 ${padding ? 'px-5 py-3.5' : 'px-4 py-3'}`}>
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
            )}
            {description && (
              <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={padding ? 'p-5' : ''}>{children}</div>
    </div>
  );
}
