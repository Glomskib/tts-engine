import type { Metadata } from 'next';
import Link from 'next/link';
import { BreadcrumbSchema } from '@/components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: 'Developer API — FlashFlow AI',
  description:
    'Build on FlashFlow AI. Generate TikTok scripts programmatically with our HTTP API. cURL and JavaScript examples included.',
  alternates: { canonical: 'https://flashflowai.com/developers' },
  openGraph: {
    title: 'FlashFlow AI — Developer API',
    description: 'Generate TikTok scripts programmatically. HTTP + JSON.',
    url: 'https://flashflowai.com/developers',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'FlashFlow AI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlashFlow AI — Developer API',
    description: 'Generate TikTok scripts programmatically. HTTP + JSON.',
    images: ['/opengraph-image'],
  },
};

const CURL_EXAMPLE = `curl -X POST https://flashflowai.com/api/public/generate-script \\
  -H "Content-Type: application/json" \\
  -d '{
    "product_name": "Matcha Energy Powder",
    "product_description": "Plant-based caffeine, no jitters",
    "platform": "tiktok",
    "risk_tier": "BALANCED"
  }'`;

const JS_EXAMPLE = `const res = await fetch("https://flashflowai.com/api/public/generate-script", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    product_name: "Matcha Energy Powder",
    product_description: "Plant-based caffeine, no jitters",
    platform: "tiktok",        // tiktok | reels | youtube_shorts | youtube_long | facebook_reels
    risk_tier: "BALANCED",      // SAFE | BALANCED | SPICY
    persona_id: "skeptic",      // optional — see /admin/personas for the full set
  }),
});

const { ok, skit } = await res.json();
if (!ok) throw new Error("Generation failed");
console.log(skit.hook_variants[0].spoken);`;

const RESPONSE_EXAMPLE = `{
  "ok": true,
  "skit": {
    "hook_variants": [
      { "tier": "SAFE",     "spoken": "...", "visual": "...", "on_screen": "..." },
      { "tier": "BALANCED", "spoken": "...", "visual": "...", "on_screen": "..." },
      { "tier": "SPICY",    "spoken": "...", "visual": "...", "on_screen": "..." }
    ],
    "hook_line":   "...",
    "beats": [
      { "t": "0:00", "action": "...", "dialogue": "...", "on_screen_text": "..." }
    ],
    "cta_line":    "...",
    "cta_overlay": "...",
    "b_roll":      ["..."],
    "overlays":    ["..."]
  }
}`;

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <BreadcrumbSchema
        trail={[
          { name: 'Home', url: 'https://flashflowai.com/' },
          { name: 'Developers', url: 'https://flashflowai.com/developers' },
        ]}
      />

      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300">
          Beta
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          FlashFlow API
        </h1>
        <p className="text-lg text-zinc-400 mb-10 leading-relaxed">
          Generate TikTok-Shop-grade scripts from any backend. Same engine the
          FlashFlow app runs on — hooks, beats, CTAs, b-roll, overlays. Free
          tier is rate-limited; paid tiers unlock higher volume + persona
          targeting.
        </p>

        {/* Quick start */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Quick start</h2>
          <p className="text-zinc-400 mb-4">
            One endpoint. No auth header required on the free tier — IP-bucketed
            rate limit applies. Paid usage attaches a session cookie or an
            <code className="mx-1 px-1.5 py-0.5 rounded bg-zinc-800 text-xs text-teal-300">x-api-key</code>
            header (issue from your account once the closed beta opens).
          </p>
          <CodeBlock lang="bash" code={CURL_EXAMPLE} />
        </section>

        {/* Endpoint */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Endpoint</h2>
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
              <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 text-xs font-mono font-semibold">POST</span>
              <span className="font-mono text-sm text-zinc-200">/api/public/generate-script</span>
            </div>
            <div className="p-5 text-sm text-zinc-400">
              <p className="mb-4">
                Returns a complete script for one of the five supported short- or long-form platforms.
                Each call returns three hook variants (Safe / Balanced / Spicy) so you can A/B without re-prompting.
              </p>
              <ParamTable
                params={[
                  { name: 'product_name', type: 'string', required: true, desc: '3-100 chars. The thing the creator is selling or talking about.' },
                  { name: 'product_description', type: 'string', required: false, desc: 'Up to 500 chars (4000 for youtube_long). Helps the model write specific copy.' },
                  { name: 'platform', type: 'enum', required: false, desc: 'tiktok | reels | youtube_shorts | youtube_long | facebook_reels — defaults to tiktok.' },
                  { name: 'risk_tier', type: 'enum', required: false, desc: 'SAFE | BALANCED | SPICY — controls how punchy / edgy the script gets.' },
                  { name: 'persona_id', type: 'string', required: false, desc: 'Persona slug (e.g. skeptic, hype, parent). Free tier supports 8; paid tiers all 20+.' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* JS */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">JavaScript</h2>
          <CodeBlock lang="javascript" code={JS_EXAMPLE} />
        </section>

        {/* Response */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Response shape</h2>
          <CodeBlock lang="json" code={RESPONSE_EXAMPLE} />
        </section>

        {/* Rate limits */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Rate limits</h2>
          <ul className="space-y-2 text-zinc-400">
            <li className="flex gap-3"><span className="text-teal-400">·</span> Anonymous: 5 generations / hour / IP.</li>
            <li className="flex gap-3"><span className="text-teal-400">·</span> Free authenticated: 5 / day.</li>
            <li className="flex gap-3"><span className="text-teal-400">·</span> Creator Pro: unlimited (fair-use cap at 1k / hour).</li>
            <li className="flex gap-3"><span className="text-teal-400">·</span> Business / Content Fleet: contact for custom limits.</li>
          </ul>
        </section>

        {/* Errors */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Errors</h2>
          <p className="text-zinc-400 mb-4">JSON body on failure: <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-xs text-rose-300">{`{ "error": "...", "correlation_id": "..." }`}</code>. Include the <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-xs text-rose-300">correlation_id</code> in any support email.</p>
          <ul className="space-y-2 text-zinc-400">
            <li><span className="font-mono text-rose-300 mr-2">400</span> Validation — bad product name, unknown platform, invalid risk_tier.</li>
            <li><span className="font-mono text-rose-300 mr-2">429</span> Rate-limited — see headers <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-xs">x-ratelimit-remaining</code>, <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-xs">x-ratelimit-reset</code>.</li>
            <li><span className="font-mono text-rose-300 mr-2">500</span> Generation failed — retry once; if it persists, check Twitter / status page.</li>
            <li><span className="font-mono text-rose-300 mr-2">502</span> Upstream model error — automatic retry behavior recommended.</li>
          </ul>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-teal-500/20 bg-gradient-to-br from-teal-500/10 to-transparent p-6 sm:p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Building something?</h2>
          <p className="text-zinc-400 mb-6">
            Higher rate limits, persona presets, and direct support are part of the closed-beta API tier. Drop a note and we&apos;ll get you set up.
          </p>
          <a
            href="mailto:miles@makingmilesmatter.com?subject=FlashFlow%20API%20access"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors"
          >
            Request API access
          </a>
        </section>

        <p className="text-xs text-zinc-600 mt-12">
          The free <Link href="/script-generator" className="underline hover:text-zinc-400">script generator</Link> on this site uses the same endpoint.
          Pricing on <Link href="/pricing" className="underline hover:text-zinc-400">/pricing</Link>.
        </p>
      </div>
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0b0e] overflow-hidden">
      <div className="px-4 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-zinc-500">
        {lang}
      </div>
      <pre className="p-5 overflow-x-auto text-sm leading-relaxed text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ParamTable({
  params,
}: {
  params: { name: string; type: string; required: boolean; desc: string }[];
}) {
  return (
    <div className="space-y-3">
      {params.map((p) => (
        <div key={p.name} className="border-l-2 border-white/10 pl-4 py-1">
          <div className="flex flex-wrap items-baseline gap-2 mb-1">
            <code className="text-sm text-teal-300 font-mono">{p.name}</code>
            <span className="text-xs text-zinc-500 font-mono">{p.type}</span>
            {p.required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 uppercase">required</span>}
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">{p.desc}</p>
        </div>
      ))}
    </div>
  );
}
