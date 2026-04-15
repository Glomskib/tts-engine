'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Zap, CheckCircle, ArrowRight, Shield, Clock, Users } from 'lucide-react';
import { BRAND } from '@/lib/branding';

const INCLUDES = [
  { icon: Zap, text: 'Full system setup — agents, lanes, workflows' },
  { icon: Shield, text: 'Integration configuration — connect your tools' },
  { icon: Clock, text: 'Daily monitoring — we watch your system' },
  { icon: Users, text: 'Client dashboard — see what got done every day' },
  { icon: CheckCircle, text: 'Proof tracking — every task verified' },
];

export default function OfferPage() {
  if (!BRAND.showOffer) notFound();
  const a = BRAND.accentClasses;
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/ops" className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${a.text}`} />
            <span className="font-semibold text-sm">{BRAND.name}</span>
          </Link>
          <Link href="/demo" className="text-sm text-zinc-400 hover:text-white transition-colors">
            See Demo
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight">
            I&apos;ll set up your entire
            <br />
            <span className={a.text}>AI operations system</span>
          </h1>
          <p className="text-lg text-zinc-400">
            You get a fully configured system that runs your daily operations,
            shows you what matters, and tells you when something is wrong.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
          <h2 className="font-semibold text-lg">What&apos;s included</h2>
          <div className="space-y-3">
            {INCLUDES.map(item => (
              <div key={item.text} className="flex items-start gap-3">
                <item.icon className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-zinc-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-semibold text-lg">How it works</h2>
          <div className="grid gap-3">
            {[
              { step: '1', text: 'You tell me what your business does and what tools you use' },
              { step: '2', text: 'I configure your system — agents, lanes, workflows, integrations' },
              { step: '3', text: 'Within 48 hours you see your operations running in one place' },
              { step: '4', text: 'Every morning you open your dashboard and know exactly what happened' },
            ].map(item => (
              <div key={item.step} className="flex items-start gap-3 px-4 py-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <span className={`w-6 h-6 flex items-center justify-center ${a.primary} text-white text-xs font-bold rounded-full flex-shrink-0`}>{item.step}</span>
                <span className="text-sm text-zinc-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-xl border ${a.border} ${a.bg} p-8 text-center space-y-4`}>
          <div className={`text-sm ${a.text} font-medium uppercase tracking-wider`}>Done For You Setup</div>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-5xl font-bold">$999</span>
            <span className="text-zinc-500">one-time</span>
          </div>
          <div className="text-sm text-zinc-400">+ $299/mo for ongoing monitoring &amp; Pro features</div>
          <a
            href={`mailto:${BRAND.contactEmail}?subject=${encodeURIComponent(BRAND.name + ' — Done For You Setup')}&body=${encodeURIComponent(`I'm interested in getting my operations system set up. Here's what my business does:\n\n`)}`}
            className={`inline-flex items-center gap-2 px-8 py-3 ${a.primary} ${a.hover} text-white font-semibold rounded-xl transition-colors`}
          >
            Book Setup Call <ArrowRight className="w-4 h-4" />
          </a>
          <div className="text-xs text-zinc-600">No commitment until we talk. Reply within 24h.</div>
        </div>

        <div className="text-center space-y-3 py-6">
          <p className="text-zinc-500 text-sm italic">
            &quot;I was running everything in my head. Now I open one screen and know exactly what happened.&quot;
          </p>
          <Link
            href="/demo"
            className={`inline-flex items-center gap-2 text-sm ${a.text} hover:opacity-80 transition-opacity`}
          >
            See the live demo <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-600">
        {BRAND.name}
      </footer>
    </div>
  );
}
