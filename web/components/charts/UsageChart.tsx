'use client';

import { useMemo } from 'react';

interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

interface UsageChartProps {
  data: DataPoint[];
  title?: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  showLabels?: boolean;
}

export function UsageChart({
  data,
  title,
  color = '#14b8a6',
  height = 200,
  showGrid = true,
  showLabels = true,
}: UsageChartProps) {
  const { maxValue, points, normalizedData } = useMemo(() => {
    if (data.length === 0) {
      return { maxValue: 0, points: '', normalizedData: [] };
    }

    const max = Math.max(...data.map(d => d.value), 1);
    const stepX = 100 / Math.max(data.length - 1, 1);

    const normalized = data.map((d, i) => ({
      ...d,
      x: i * stepX,
      y: 100 - (d.value / max) * 100,
    }));

    const pathPoints = normalized
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');

    return { maxValue: max, points: pathPoints, normalizedData: normalized };
  }, [data]);

  const areaPath = useMemo(() => {
    if (normalizedData.length === 0) return '';
    const lastPoint = normalizedData[normalizedData.length - 1];
    return `${points} L ${lastPoint?.x || 0} 100 L 0 100 Z`;
  }, [points, normalizedData]);

  if (data.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        {title && <h3 className="text-sm font-medium text-zinc-400 mb-4">{title}</h3>}
        <div className="flex items-center justify-center text-zinc-500 text-sm" style={{ height }}>
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      {title && <h3 className="text-sm font-medium text-zinc-400 mb-4">{title}</h3>}

      <div style={{ height }} className="relative">
        {/* Y-axis labels */}
        {showLabels && (
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-zinc-500 pr-2 -ml-8 w-8 text-right">
            <span>{maxValue}</span>
            <span>{Math.round(maxValue / 2)}</span>
            <span>0</span>
          </div>
        )}

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ marginLeft: showLabels ? '8px' : 0 }}
        >
          {/* Grid lines */}
          {showGrid && (
            <g className="text-zinc-800">
              {[0, 25, 50, 75, 100].map(y => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="100"
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  strokeDasharray={y === 0 || y === 100 ? 'none' : '2,2'}
                />
              ))}
            </g>
          )}

          {/* Area fill */}
          <path d={areaPath} fill={color} fillOpacity="0.1" />

          {/* Line */}
          <path
            d={points}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Points */}
          {normalizedData.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                fill={color}
                className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r="2"
                fill={color}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* X-axis labels */}
      {showLabels && (
        <div className="flex justify-between mt-2 text-xs text-zinc-500" style={{ marginLeft: showLabels ? '8px' : 0 }}>
          {data
            .filter((_, i) => i % Math.max(1, Math.ceil(data.length / 6)) === 0 || i === data.length - 1)
            .map((d, i) => (
              <span key={i}>
                {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// Bar chart variant
interface BarChartProps {
  data: DataPoint[];
  title?: string;
  color?: string;
  height?: number;
}

export function BarChart({ data, title, color = '#14b8a6', height = 200 }: BarChartProps) {
  const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

  if (data.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        {title && <h3 className="text-sm font-medium text-zinc-400 mb-4">{title}</h3>}
        <div className="flex items-center justify-center text-zinc-500 text-sm" style={{ height }}>
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      {title && <h3 className="text-sm font-medium text-zinc-400 mb-4">{title}</h3>}

      <div style={{ height }} className="flex items-end gap-1">
        {data.map((d, i) => {
          const barHeight = (d.value / maxValue) * 100;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center group"
            >
              <div
                className="w-full rounded-t transition-all group-hover:opacity-80"
                style={{
                  height: `${barHeight}%`,
                  backgroundColor: color,
                  minHeight: d.value > 0 ? '4px' : '0',
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-2 text-xs text-zinc-500">
        {data
          .filter((_, i) => i % Math.max(1, Math.ceil(data.length / 6)) === 0 || i === data.length - 1)
          .map((d, i) => (
            <span key={i}>
              {d.label || new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          ))}
      </div>
    </div>
  );
}

// Donut chart for showing percentages
interface DonutChartProps {
  value: number;
  max: number;
  label: string;
  color?: string;
  size?: number;
}

export function DonutChart({ value, max, label, color = '#14b8a6', size = 120 }: DonutChartProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{Math.round(percentage)}%</span>
        </div>
      </div>
      <span className="text-sm text-zinc-400 mt-2">{label}</span>
      <span className="text-xs text-zinc-500">{value} / {max}</span>
    </div>
  );
}
