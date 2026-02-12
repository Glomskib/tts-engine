import { Metadata } from 'next';
import Link from 'next/link';
import { FreeScriptsForm } from './FreeScriptsForm';
import { PublicLayout } from '@/components/PublicLayout';

export const metadata: Metadata = {
  title: 'Free UGC Script Vault — 50 TikTok Hooks + 10 Script Templates | FlashFlow AI',
  description: 'Download 50 proven TikTok hooks and 10 ready-to-film script templates. These hooks have generated millions in TikTok Shop sales. Free, no credit card required.',
  openGraph: {
    title: 'Free UGC Script Vault — 50 TikTok Hooks + 10 Script Templates',
    description: 'Download 50 proven TikTok hooks and 10 ready-to-film script templates for TikTok Shop.',
    type: 'website',
  },
};

const SAMPLE_HOOKS = [
  { niche: 'Health', hook: '"I was skeptical until day 3... then I couldn\'t stop looking in the mirror"' },
  { niche: 'Beauty', hook: '"My dermatologist asked what I was using. Her face when I told her the price..."' },
  { niche: 'Home', hook: '"I\'ve been doing laundry wrong my entire life. This $8 thing changed everything."' },
  { niche: 'Tech', hook: '"POV: You just replaced 4 apps with one $12 gadget from TikTok Shop"' },
];

export default function FreeScriptsPage() {
  return (
    <PublicLayout>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-teal-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 pb-20">
        {/* Hero */}
        <div className="text-center pt-12 pb-16">
          <div className="inline-block px-4 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-full text-sm text-teal-400 mb-6">
            Free Download &mdash; No Credit Card Required
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            The UGC Script Vault
          </h1>
          <p className="text-xl sm:text-2xl text-zinc-400 max-w-2xl mx-auto mb-4">
            50 Proven TikTok Hooks + 10 Ready-to-Film Script Templates
          </p>
          <p className="text-zinc-500 max-w-xl mx-auto">
            These hooks have generated millions in TikTok Shop sales. Organized by niche.
            Copy, customize, and film.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left: Preview */}
          <div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-4">Preview: Sample Hooks</h2>
            <div className="space-y-3">
              {SAMPLE_HOOKS.map((item, i) => (
                <div key={i} className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
                  <span className="text-xs font-medium text-teal-400 uppercase tracking-wider">{item.niche}</span>
                  <p className="text-zinc-300 mt-1 italic">{item.hook}</p>
                </div>
              ))}
              <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-zinc-900/90" />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">+ 46 more hooks</span>
                <p className="text-zinc-600 mt-1 italic blur-sm select-none">
                  &ldquo;This $15 find from TikTok Shop literally replaced my...&rdquo;
                </p>
              </div>
            </div>

            <div className="mt-8 bg-zinc-900/60 border border-white/10 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-200 mb-3">What&apos;s Inside</h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex items-start gap-2">
                  <span className="text-teal-400 mt-0.5">&#10003;</span>
                  <span>50 hooks organized by niche (Health, Beauty, Tech, Home, Fashion)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-400 mt-0.5">&#10003;</span>
                  <span>10 complete script templates with Hook, Setup, Body, CTA</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-400 mt-0.5">&#10003;</span>
                  <span>The viral script formula breakdown</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-400 mt-0.5">&#10003;</span>
                  <span>Persona guide: which voice to use for each product type</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right: Email Capture Form */}
          <div className="lg:sticky lg:top-8">
            <FreeScriptsForm />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
