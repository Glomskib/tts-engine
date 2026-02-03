'use client';

interface TopPerformersItem {
  rank: number;
  label: string;
  count: number;
  metric?: string;
}

interface TopPerformersCardProps {
  title: string;
  items: TopPerformersItem[];
  emptyMessage?: string;
}

export function TopPerformersCard({
  title,
  items,
  emptyMessage = 'No data yet',
}: TopPerformersCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">{title}</h3>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-4">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.rank} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  item.rank === 1
                    ? 'bg-amber-500/20 text-amber-400'
                    : item.rank === 2
                    ? 'bg-zinc-400/20 text-zinc-300'
                    : item.rank === 3
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {item.rank}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{item.label}</p>
                {item.metric && (
                  <p className="text-xs text-zinc-500">{item.metric}</p>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-white">{item.count}</span>
                <span className="text-xs text-zinc-500 ml-1">wins</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TopPerformersCard;
