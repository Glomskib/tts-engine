import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, FileText, Mic, BookOpen, CreditCard } from 'lucide-react';

const suggestions = [
  {
    label: 'Script Generator',
    href: '/script-generator',
    description: 'Create viral TikTok scripts with AI — free',
    icon: FileText,
    free: true,
  },
  {
    label: 'TikTok Transcriber',
    href: '/transcribe',
    description: 'Transcribe & analyze any TikTok video — free',
    icon: Mic,
    free: true,
  },
  {
    label: 'YouTube Transcriber',
    href: '/youtube-transcribe',
    description: 'Transcribe any YouTube video with AI — free',
    icon: BookOpen,
    free: true,
  },
  {
    label: 'Pricing',
    href: '/pricing',
    description: 'Plans for creators, brands, and agencies',
    icon: CreditCard,
    free: false,
  },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Header */}
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <Image
            src="/FFAI.png"
            alt="FlashFlow AI"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="font-semibold text-zinc-100">FlashFlow AI</span>
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-lg">
          {/* 404 */}
          <div className="mb-6">
            <span className="text-[100px] sm:text-[140px] font-bold leading-none bg-gradient-to-b from-zinc-400 to-zinc-700 bg-clip-text text-transparent select-none">
              404
            </span>
          </div>

          {/* Message */}
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            This page doesn&apos;t exist
          </h1>
          <p className="text-zinc-400 mb-10 leading-relaxed">
            The link may be broken, or the page may have been removed. Try one of our free tools instead&nbsp;&mdash; no signup required.
          </p>

          {/* Suggestions */}
          <div className="mb-10">
            <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">
              Try these instead
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {suggestions.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-3 p-4 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/[0.03] transition-all"
                >
                  <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                    <item.icon size={16} className="text-zinc-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                      {item.label}
                      {item.free && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-teal-500/20 text-teal-400 rounded">Free</span>
                      )}
                    </span>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/script-generator"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors"
            >
              Generate a Script Free
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 text-zinc-300 font-semibold hover:bg-white/5 transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-zinc-600">
        Need help?{' '}
        <a
          href="mailto:support@flashflow.ai"
          className="text-zinc-400 hover:text-white transition-colors"
        >
          Contact support
        </a>
      </footer>
    </div>
  );
}
