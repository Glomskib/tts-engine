import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FlashFlow — VA Dashboard",
  description: "Video editing assignments and status tracking",
};

export default function VALayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Simple top bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-teal-400">FlashFlow</span>
            <span className="text-sm text-zinc-500 hidden sm:inline">VA Dashboard</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
