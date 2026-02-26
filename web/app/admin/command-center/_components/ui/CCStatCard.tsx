'use client';

import Link from 'next/link';

interface CCStatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  href?: string;
  trend?: 'up' | 'down' | 'flat';
}

export default function CCStatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'text-zinc-400',
  href,
  trend,
}: CCStatCardProps) {
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : '';
  const content = (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 ${href ? 'hover:border-zinc-600 transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className={`text-2xl font-bold text-white ${trendColor}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1 truncate">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
