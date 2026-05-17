// ============================================================
// /api-docs — public API reference for FlashFlow.
//
// Documents the endpoints already exposed publicly. Linked from
// the footer + Pro/Business plan descriptions on /pricing.
//
// This is a static reference today. When we ship an API-key
// system (Pro+ tier feature on the roadmap), the keys panel
// gets added on top. For now: just the docs.
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: { absolute: 'API Docs | FlashFlow AI' },
  description:
    'Public API for FlashFlow AI — generate scripts, fetch stats, and read deployment health programmatically. JSON over HTTPS.',
  openGraph: {
    title: 'FlashFlow AI API Reference',
    description:
      'Public API for FlashFlow AI — generate scripts, fetch stats, and read deployment health programmatically.',
    url: 'https://flashflowai.com/api-docs',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
  },
  twitter: {
    card: 'summary',
    title: 'FlashFlow AI API Reference',
    description:
      'Generate scripts, fetch stats, and read deployment health programmatically.',
  },
  alternates: { canonical: 'https://flashflowai.com/api-docs' },
};

// Each endpoint has a small schema. Static for now; once we expand
// we can extract this into MDX or OpenAPI.
const ENDPOINTS: {
  method: string;
  path: string;
  summary: string;
  body?: string;
  example?: string;
  response?: string;
  notes?: string[];
}[] = [
  {
    method: 'POST',
    path: '/api/public/generate-script',
    summary: 'Generate a TikTok / Reels / Shorts / YouTube script with 3 hook variants.',
    body: `{
  "product_name": "Matcha Energy Powder",
  "product_description": "Optional context (max 500 chars; 4000 for youtube_long).",
  "persona_id": "skeptic-reviewer",   // optional — see /script-generator for the full list
  "risk_tier": "BALANCED",             // SAFE | BALANCED | SPICY
  "platform": "tiktok"                 // tiktok | reels | youtube_shorts | youtube_long | facebook_reels
}`,
    response: `{
  "ok": true,
  "skit": {
    "hook_variants": [
      { "tier": "SAFE",     "spoken": "...", "visual": "...", "on_screen": "..." },
      { "tier": "BALANCED", "spoken": "...", "visual": "...", "on_screen": "..." },
      { "tier": "SPICY",    "spoken": "...", "visual": "...", "on_screen": "..." }
    ],
    "beats": [ { "t": "0:00-0:03", "action": "...", "dialogue": "...", "on_screen_text": "..." } ],
    "cta_line": "...",
    "cta_overlay": "...",
    "b_roll": ["..."],
    "overlays": ["..."]
  }
}`,
    notes: [
      'Unauthenticated calls: 5/day per IP.',
      'Authenticated free users: 5/day.',
      'Paid users: per-plan limits (see /pricing).',
      'Long-form scripts can take up to 2 minutes; budget your timeouts accordingly.',
    ],
  },
  {
    method: 'GET',
    path: '/api/public/stats',
    summary: 'Aggregate platform stats (scripts generated, active creators, current rating).',
    response: `{
  "creatorCount": 500,
  "scriptCount": 10000,
  "rating": 4.8
}`,
    notes: ['Public, no auth required.'],
  },
  {
    method: 'GET',
    path: '/api/health',
    summary: 'Deployment + service health for monitoring.',
    response: `{
  "ok": true,
  "status": "healthy",
  "version": "<git short SHA>",
  "checks": [ { "name": "database", "status": "pass" }, ... ]
}`,
    notes: [
      'Use the `version` field to verify deploys.',
      'Returns HTTP 200 on healthy, 503 on critical failure.',
    ],
  },
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-12">
          <p className="text-sm font-medium text-teal-400 uppercase tracking-widest mb-2">
            Developer API
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">API Reference</h1>
          <p className="text-lg text-zinc-400 leading-relaxed">
            All endpoints return JSON over HTTPS. Base URL:{' '}
            <code className="px-2 py-1 rounded bg-zinc-800/80 text-teal-300 text-sm">
              https://flashflowai.com
            </code>
          </p>
        </div>

        <section className="mb-12 p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
          <h2 className="text-lg font-semibold mb-2">Authentication</h2>
          <p className="text-zinc-400 leading-relaxed text-sm">
            Public endpoints don&apos;t require an API key. Rate-limited per IP and per user.
            Higher per-plan limits + dedicated programmatic API keys ship with Pro and Business
            tiers — coming soon. Drop a note via the contact form on{' '}
            <Link href="/pricing" className="text-teal-400 hover:text-teal-300 underline underline-offset-2">
              /pricing
            </Link>{' '}
            if you need early access.
          </p>
        </section>

        <div className="space-y-8">
          {ENDPOINTS.map((ep) => (
            <article key={ep.path} className="rounded-2xl border border-white/10 bg-zinc-900/40 overflow-hidden">
              <header className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold tracking-wider ${
                    ep.method === 'GET'
                      ? 'bg-teal-500/15 text-teal-300'
                      : 'bg-violet-500/15 text-violet-300'
                  }`}
                >
                  {ep.method}
                </span>
                <code className="text-zinc-200 text-sm">{ep.path}</code>
              </header>
              <div className="px-6 py-5 space-y-4">
                <p className="text-zinc-300 leading-relaxed">{ep.summary}</p>

                {ep.body && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                      Request body
                    </div>
                    <pre className="px-4 py-3 rounded-lg bg-black/40 border border-white/5 text-xs text-zinc-200 overflow-x-auto">
                      {ep.body}
                    </pre>
                  </div>
                )}

                {ep.response && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Response</div>
                    <pre className="px-4 py-3 rounded-lg bg-black/40 border border-white/5 text-xs text-zinc-200 overflow-x-auto">
                      {ep.response}
                    </pre>
                  </div>
                )}

                {ep.notes && ep.notes.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Notes</div>
                    <ul className="space-y-1">
                      {ep.notes.map((n, i) => (
                        <li key={i} className="text-sm text-zinc-400 flex gap-2">
                          <span className="text-zinc-600">•</span>
                          <span>{n}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        <section className="mt-12 p-6 rounded-2xl border border-white/10 bg-gradient-to-b from-teal-500/[0.06] to-transparent">
          <h2 className="text-lg font-semibold mb-2">Need a Zapier / Make / n8n integration?</h2>
          <p className="text-zinc-400 leading-relaxed text-sm mb-4">
            Drop a request through the contact form on{' '}
            <Link href="/pricing" className="text-teal-400 hover:text-teal-300 underline underline-offset-2">
              /pricing
            </Link>
            . Higher-tier customers get prioritized webhook + workflow templates.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm text-teal-300 hover:text-teal-200"
          >
            See plans →
          </Link>
        </section>
      </div>
    </div>
  );
}
