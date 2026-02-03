'use client';

import { Clock } from 'lucide-react';

interface VideoLengthChartProps {
  shortest: number;
  longest: number;
  avgWinning: number;
  sweetSpot: { min: number; max: number } | null;
}

export function VideoLengthChart({
  shortest,
  longest,
  avgWinning,
  sweetSpot,
}: VideoLengthChartProps) {
  if (!sweetSpot || shortest === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Optimal Video Length
        </h3>
        <p className="text-sm text-zinc-500 text-center py-4">
          Need more data to determine optimal length
        </p>
      </div>
    );
  }

  const range = longest - shortest;
  const sweetSpotStart = ((sweetSpot.min - shortest) / range) * 100;
  const sweetSpotWidth = ((sweetSpot.max - sweetSpot.min) / range) * 100;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Optimal Video Length
      </h3>

      <p className="text-sm text-zinc-300 mb-4">
        Your winners: <span className="text-white font-medium">{shortest}-{longest} seconds</span>
        {' '}(sweet spot: <span className="text-teal-400 font-medium">{sweetSpot.min}-{sweetSpot.max}s</span>)
      </p>

      {/* Visual range indicator */}
      <div className="relative h-4 bg-zinc-800 rounded-full overflow-hidden mb-2">
        {/* Full range */}
        <div className="absolute inset-y-0 left-0 right-0 bg-zinc-700 rounded-full" />

        {/* Sweet spot highlight */}
        <div
          className="absolute inset-y-0 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full"
          style={{
            left: `${sweetSpotStart}%`,
            width: `${sweetSpotWidth}%`,
          }}
        />

        {/* Average marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-full shadow-lg"
          style={{
            left: `${((avgWinning - shortest) / range) * 100}%`,
          }}
          title={`Average: ${avgWinning}s`}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{shortest}s</span>
        <span className="text-teal-400">{sweetSpot.min}-{sweetSpot.max}s</span>
        <span>{longest}s</span>
      </div>

      <div className="mt-3 pt-3 border-t border-zinc-800">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Average winning length</span>
          <span className="text-white font-medium">{avgWinning}s</span>
        </div>
      </div>
    </div>
  );
}

export default VideoLengthChart;
