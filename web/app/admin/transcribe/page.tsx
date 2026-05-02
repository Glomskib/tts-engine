'use client';

import Link from 'next/link';
import { Youtube, Sparkles, Package } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';
import TranscriberWorkspace from '@/components/TranscriberWorkspace';

const TRANSCRIBE_FAQ = [
  {
    q: 'How accurate is the AI transcriber?',
    a: 'FlashFlow Transcriber uses a state-of-the-art Whisper-based AI model that delivers 90–97% accuracy on clear speech, depending on accent, background noise, and audio quality. Word-level timestamps are returned for every transcript.',
  },
  {
    q: 'What languages does the transcriber support?',
    a: 'The transcriber supports 50+ languages including English, Spanish, French, German, Portuguese, Italian, Dutch, Russian, Mandarin, Japanese, Korean, Hindi, and Arabic. Language is auto-detected — you don\'t have to choose.',
  },
  {
    q: 'What are the file size and length limits?',
    a: 'Free tier supports files up to 25 MB and roughly 30 minutes of audio per transcription. Paid plans support longer videos and batch processing. YouTube and direct video links are downloaded server-side, so length is the only practical constraint.',
  },
  {
    q: 'How does it compare to Otter, Rev, and Descript?',
    a: 'FlashFlow Transcriber is free for short clips, accepts YouTube links directly (no copy-paste), and feeds straight into the AI Video Editor, Hook Generator, and Content Studio. Rev charges per minute. Otter is meeting-focused. Descript is a paid audio editor. FlashFlow is built for short-form video creators.',
  },
  {
    q: 'Is there a free version?',
    a: 'Yes — a permanent free tier with limits on file size and monthly transcription minutes, no credit card required. Creator and Pro plans unlock longer videos, batch processing, and direct integration with the rest of the FlashFlow content workflow.',
  },
];

export default function AdminTranscribePage() {
  const { subscription } = useCredits();

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="max-w-5xl mx-auto px-4 pt-4 flex items-center gap-4 text-sm">
        <Link
          href="/admin/youtube-transcribe"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Youtube size={14} />
          YouTube Video
        </Link>
        <span className="text-zinc-700">|</span>
        <Link
          href="/admin/content-studio"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Sparkles size={14} />
          Content Studio
        </Link>
        <span className="text-zinc-700">|</span>
        <Link
          href="/admin/content-pack"
          className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Package size={14} />
          Content Pack
        </Link>
      </div>

      <TranscriberWorkspace isPortal={true} isLoggedIn={true} planId={subscription?.planId} />

      {/* FAQ — visible to humans + indexed by Google + ingested by LLMs */}
      <section
        aria-labelledby="transcribe-faq-heading"
        className="max-w-5xl mx-auto px-4 pt-12 pb-16"
      >
        <h2
          id="transcribe-faq-heading"
          className="text-2xl font-semibold text-white mb-6"
        >
          Frequently asked questions
        </h2>
        <div className="space-y-4">
          {TRANSCRIBE_FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-white/10 bg-zinc-900/40 p-4 open:bg-zinc-900/70 transition-colors"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between text-zinc-100 font-medium">
                <span>{item.q}</span>
                <span className="text-zinc-500 transition-transform group-open:rotate-45 text-xl leading-none">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
