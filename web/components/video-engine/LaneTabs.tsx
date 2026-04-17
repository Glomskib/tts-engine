import Link from 'next/link';

type Lane = 'product' | 'clipper';

interface LaneTabsProps {
  active: Lane;
}

const LANES: Array<{
  key: Lane;
  label: string;
  sublabel: string;
  href: string;
  accent: string;
}> = [
  {
    key: 'product',
    label: 'Product / TikTok Shop',
    sublabel: 'Short ads, reviews, demos. Built for sellers.',
    href: '/video-engine',
    accent: '#FF005C',
  },
  {
    key: 'clipper',
    label: 'Long-form Clipping',
    sublabel: 'Podcasts, streams, YouTubes → multiple short clips.',
    href: '/video-engine?lane=clipper',
    accent: '#00D4AA',
  },
];

export default function LaneTabs({ active }: LaneTabsProps) {
  return (
    <nav aria-label="Video engine workflow" className="grid gap-2 grid-cols-1 sm:grid-cols-2">
      {LANES.map((lane) => {
        const isActive = active === lane.key;
        return (
          <Link
            key={lane.key}
            href={lane.href}
            prefetch
            className={[
              'block rounded-xl border px-4 py-3 transition-all',
              isActive
                ? 'border-zinc-200 bg-zinc-900'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700',
            ].join(' ')}
            style={isActive ? { boxShadow: `0 0 0 2px ${lane.accent}` } : undefined}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-100">{lane.label}</span>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: lane.accent }} />
            </div>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">{lane.sublabel}</p>
          </Link>
        );
      })}
    </nav>
  );
}
