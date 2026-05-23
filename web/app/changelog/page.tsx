import Link from 'next/link';
import { Sparkles, Wand2, Camera, Library, Zap } from 'lucide-react';

export const metadata = {
  title: 'Changelog',
  description: 'What we shipped recently in FlashFlow AI — editor, studio, avatars, library, infra.',
};

interface Entry {
  date: string;
  badge: string;
  title: string;
  body: string;
  icon: 'sparkles' | 'wand' | 'camera' | 'library' | 'zap';
}

const ENTRIES: Entry[] = [
  {
    date: 'May 2026',
    badge: 'Launch ready',
    title: 'Unified nav + global footer across every page',
    body: 'Top nav, footer, mobile drawer, and 404 page all share one polished shell so jumping between Editor, Studio, Avatars, Library and free tools feels seamless.',
    icon: 'sparkles',
  },
  {
    date: 'May 2026',
    badge: 'Editor',
    title: 'AI Video Editor — clearer "what you get" hero',
    body: 'The /create flagship now leads with the outcome (a finished, captioned short) and a chip row that explains the steps the engine runs for you: silence trim, captions, beat sync, retake detection, hook polish.',
    icon: 'wand',
  },
  {
    date: 'May 2026',
    badge: 'Studio',
    title: 'Phone-first record-stop-record loop',
    body: 'Wireless mic auto-default, sticky edit prefs, live VU meter, and an inline queue strip so you can record-and-go on iPhone without ever touching a desk.',
    icon: 'camera',
  },
  {
    date: 'May 2026',
    badge: 'Library',
    title: 'Queue heartbeat + faster progress polling',
    body: 'A live status banner tells you exactly what is processing. Polling intervals were halved so finished clips appear in your library within seconds.',
    icon: 'library',
  },
  {
    date: 'May 2026',
    badge: 'Infra',
    title: 'Always-on health page + branded fallback',
    body: 'Internal /admin/launch-status surface shows every dependency at a glance. Public 404 funnels lost visitors back to the right tool instead of dead-ending.',
    icon: 'zap',
  },
];

const ICONS: Record<Entry['icon'], React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  wand: Wand2,
  camera: Camera,
  library: Library,
  zap: Zap,
};

export default function ChangelogPage() {
  return (
    <main className="max-w-3xl mx-auto px-5 py-12">
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs mb-3">
          <Sparkles className="w-3 h-3" /> Changelog
        </div>
        <h1 className="text-4xl font-bold mb-2">What we shipped</h1>
        <p className="text-zinc-400">Lightweight log of the changes that hit production recently.</p>
      </div>

      <div className="space-y-4">
        {ENTRIES.map((e, i) => {
          const Icon = ICONS[e.icon];
          return (
            <article
              key={i}
              className="p-5 rounded-2xl border border-white/10 bg-zinc-900/40 hover:bg-zinc-900/60 transition"
            >
              <div className="flex items-center gap-2 text-xs mb-2">
                <span className="text-zinc-500">{e.date}</span>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">
                  {e.badge}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 flex-shrink-0">
                  <Icon className="w-4 h-4 text-teal-300" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg mb-1">{e.title}</h2>
                  <p className="text-sm text-zinc-400 leading-relaxed">{e.body}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-12 p-5 rounded-2xl border border-teal-500/30 bg-teal-500/5 text-center">
        <div className="font-semibold mb-1">Want to try it?</div>
        <p className="text-sm text-zinc-400 mb-4">Drop a clip in the AI Video Editor and see it for yourself.</p>
        <Link
          href="/create"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-sm"
        >
          Open AI Video Editor →
        </Link>
      </div>
    </main>
  );
}