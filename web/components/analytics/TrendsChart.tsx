'use client';

import { TrendingUp } from 'lucide-react';
import type { WeeklyTrend } from '@/lib/analytics/types';

interface TrendsChartProps {
  data: WeeklyTrend[];
  title?: string;
}

export function TrendsChart({ data, title = 'Scripts vs Winners' }: TrendsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          {title}
        </h3>
        <p className="text-sm text-zinc-500 text-center py-4">
          Not enough data to show trends
        </p>
      </div>
    );
  }

  const maxScripts = Math.max(...data.map((d) => d.scripts), 1);
  const maxWinners = Math.max(...data.map((d) => d.winners), 1);
  const maxValue = Math.max(maxScripts, maxWinners);
  const chartHeight = 120;

  // Calculate points for the line chart
  const getY = (value: number) => {
    const normalizedValue = value / maxValue;
    return chartHeight - normalizedValue * chartHeight;
  };

  const getX = (index: number) => {
    const width = 100;
    const padding = 5;
    const usableWidth = width - padding * 2;
    return padding + (index / Math.max(data.length - 1, 1)) * usableWidth;
  };

  // Create SVG path for lines
  const createPath = (values: number[]) => {
    if (values.length === 0) return '';
    if (values.length === 1) {
      const x = getX(0);
      const y = getY(values[0]);
      return `M ${x} ${y} L ${x} ${y}`;
    }
    return values
      .map((value, index) => {
        const x = getX(index);
        const y = getY(value);
        return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ');
  };

  const scriptsPath = createPath(data.map((d) => d.scripts));
  const winnersPath = createPath(data.map((d) => d.winners));

  // Calculate totals
  const totalScripts = data.reduce((sum, d) => sum + d.scripts, 0);
  const totalWinners = data.reduce((sum, d) => sum + d.winners, 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          {title}
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-zinc-500 rounded-full" />
            <span className="text-zinc-500">Scripts ({totalScripts})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-teal-500 rounded-full" />
            <span className="text-teal-400">Winners ({totalWinners})</span>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative" style={{ height: chartHeight }}>
        <svg
          viewBox={`0 0 100 ${chartHeight}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              y1={chartHeight * ratio}
              x2="100"
              y2={chartHeight * ratio}
              stroke="#27272a"
              strokeWidth="0.5"
            />
          ))}

          {/* Scripts line (gray) */}
          <path
            d={scriptsPath}
            fill="none"
            stroke="#71717a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Winners line (teal) */}
          <path
            d={winnersPath}
            fill="none"
            stroke="#14b8a6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Data points - Scripts */}
          {data.map((point, index) => (
            <circle
              key={`scripts-${index}`}
              cx={getX(index)}
              cy={getY(point.scripts)}
              r="1.5"
              fill="#71717a"
              className="hover:r-[2.5]"
            />
          ))}

          {/* Data points - Winners */}
          {data.map((point, index) => (
            <circle
              key={`winners-${index}`}
              cx={getX(index)}
              cy={getY(point.winners)}
              r="1.5"
              fill="#14b8a6"
              className="hover:r-[2.5]"
            />
          ))}
        </svg>

        {/* Hover tooltips */}
        <div className="absolute inset-0 flex">
          {data.map((point, index) => (
            <div
              key={index}
              className="flex-1 group relative"
              style={{ height: '100%' }}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-zinc-800 text-white text-xs px-2 py-1.5 rounded whitespace-nowrap border border-zinc-700">
                  <div className="font-medium mb-1">{point.week}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">Scripts: {point.scripts}</span>
                    <span className="text-teal-400">Winners: {point.winners}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-zinc-500">
        {data.length > 0 && <span>{data[0].week}</span>}
        {data.length > 1 && <span>{data[data.length - 1].week}</span>}
      </div>
    </div>
  );
}

export default TrendsChart;
