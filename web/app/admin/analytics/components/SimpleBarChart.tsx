'use client';

interface DataPoint {
  date: string;
  count: number;
}

interface SimpleBarChartProps {
  data: DataPoint[];
  color?: string;
  height?: number;
  showLabels?: boolean;
}

export default function SimpleBarChart({
  data,
  color = '#3b82f6',
  height = 120,
  showLabels = false,
}: SimpleBarChartProps) {
  const maxValue = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="w-full">
      <div
        className="flex items-end gap-[2px]"
        style={{ height: `${height}px` }}
      >
        {data.map((point, idx) => {
          const barHeight = (point.count / maxValue) * 100;
          return (
            <div
              key={idx}
              className="flex-1 min-w-0 group relative"
              style={{ height: '100%' }}
            >
              <div
                className="absolute bottom-0 w-full rounded-t transition-all hover:opacity-80"
                style={{
                  height: `${Math.max(barHeight, 2)}%`,
                  backgroundColor: color,
                }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-zinc-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {point.date}: {point.count}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showLabels && data.length <= 14 && (
        <div className="flex gap-[2px] mt-1">
          {data.map((point, idx) => (
            <div
              key={idx}
              className="flex-1 text-center text-[9px] text-zinc-500 truncate"
            >
              {point.date.slice(5)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
