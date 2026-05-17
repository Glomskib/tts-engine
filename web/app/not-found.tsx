import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found — FlashFlow AI',
  description: 'The page you are looking for does not exist or has moved.',
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-4 py-10">
      <div className="text-[120px] font-black leading-none bg-gradient-to-b from-zinc-400 to-zinc-700 bg-clip-text text-transparent select-none">404</div>
      <h1 className="text-2xl font-bold mt-4">This page does not exist</h1>
      <p className="text-zinc-400 mt-2 max-w-md text-center">The link may be broken, or the page may have moved. Try one of these instead:</p>
      <div className="mt-8 grid grid-cols-2 gap-3 max-w-md w-full">
        <Link href="/" className="px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm font-semibold text-center">Home</Link>
        <Link href="/create" className="px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm font-semibold text-center">Make a clip</Link>
        <Link href="/studio" className="px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm font-semibold text-center">Studio</Link>
        <Link href="/avatars" className="px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm font-semibold text-center">Avatars</Link>
      </div>
      <div className="mt-10 text-xs text-zinc-500">
        Need help? <a href="mailto:hello@flashflowai.com" className="underline hover:text-zinc-300">hello@flashflowai.com</a>
      </div>
    </div>
  );
}
