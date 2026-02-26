import { ReactNode } from 'react';

interface CCTableProps {
  children: ReactNode;
  className?: string;
}

export function CCTable({ children, className = '' }: CCTableProps) {
  return (
    <div className={`rounded-xl border border-zinc-800 overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function CCThead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-zinc-800 bg-zinc-900/70 text-left">
        {children}
      </tr>
    </thead>
  );
}

export function CCTh({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider ${className}`}>
      {children}
    </th>
  );
}

export function CCTbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-zinc-800">{children}</tbody>;
}

export function CCTr({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      className={`hover:bg-zinc-800/50 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function CCTd({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
