import Link from 'next/link';
import Image from 'next/image';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Simple header */}
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

      {/* Error content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          {/* Large 404 */}
          <div className="mb-8">
            <span className="text-[120px] sm:text-[180px] font-bold leading-none bg-gradient-to-b from-zinc-400 to-zinc-700 bg-clip-text text-transparent">
              404
            </span>
          </div>

          {/* Message */}
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Page not found
          </h1>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Let&apos;s get you back on track.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors"
            >
              <Home size={18} />
              Go Home
            </Link>
            <Link
              href="/admin/content-studio"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 text-zinc-300 font-medium hover:bg-white/5 transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>

      {/* Simple footer */}
      <footer className="p-6 text-center text-sm text-zinc-600">
        Need help?{' '}
        <a href="mailto:support@flashflow.ai" className="text-zinc-400 hover:text-white transition-colors">
          Contact support
        </a>
      </footer>
    </div>
  );
}
