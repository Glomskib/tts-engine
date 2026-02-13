import { Metadata } from 'next';
import Link from 'next/link';
import { PublicLayout } from '@/components/PublicLayout';

export const metadata: Metadata = {
  title: 'FlashFlow AI for Agencies — Replace Your 5-Tool Stack',
  description: 'Scripts + editing + pipeline + analytics. FlashFlow runs your content operation across every brand. Built for multi-brand UGC agencies.',
  openGraph: {
    title: 'FlashFlow AI for Agencies',
    description: 'Replace your 5-tool stack with one platform. Scripts, editing, pipeline, and analytics for multi-brand agencies.',
    type: 'website',
  },
};

const TOOL_COMPARISON = [
  { tool: 'ChatGPT / Claude', cost: '$20/mo', purpose: 'Script writing' },
  { tool: 'CapCut Pro', cost: '$10/mo', purpose: 'Video editing' },
  { tool: 'Notion', cost: '$10/mo', purpose: 'Content calendar' },
  { tool: 'Google Sheets', cost: '$0', purpose: 'Pipeline tracking' },
  { tool: 'Analytics tool', cost: '$30/mo', purpose: 'Performance data' },
];

export default function AgenciesPage() {
  return (
    <PublicLayout>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-violet-500/10 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 pb-20">
        {/* Hero */}
        <section className="text-center pt-16 pb-20">
          <div className="inline-block px-4 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-sm text-violet-400 mb-6">
            For UGC Agencies
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Replace your 5-tool stack<br />
            <span className="text-violet-400">with one platform.</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
            Scripts + editing + pipeline + analytics. FlashFlow runs your content operation across every brand.
          </p>
          <Link href="/login?mode=signup" className="inline-block px-8 py-4 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-lg transition-colors">
            Start Your Agency Trial
          </Link>
        </section>

        {/* Built for Multi-Brand */}
        <section className="py-16">
          <h2 className="text-3xl font-bold text-center mb-4">Built for multi-brand teams</h2>
          <p className="text-zinc-400 text-center mb-12 max-w-lg mx-auto">
            Manage 5 brands or 50. Every brand gets its own product catalog, scripts, and analytics.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Brand Workspaces', desc: 'Each brand has its own product catalog, tone of voice settings, and content history. Switch between brands in one click.' },
              { title: 'Team Pipeline', desc: 'Script → Review → Film → Edit → Post. Track every piece of content across every brand from one dashboard.' },
              { title: 'Bulk Generation', desc: 'Generate scripts for all your brands at once. The Content Planner delivers 5 scripts per brand daily.' },
            ].map((f) => (
              <div key={f.title} className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-zinc-100 mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tool Consolidation */}
        <section className="py-16">
          <h2 className="text-3xl font-bold text-center mb-4">The tool consolidation math</h2>
          <p className="text-zinc-400 text-center mb-12 max-w-lg mx-auto">
            Stop paying for 5 tools that don&apos;t talk to each other.
          </p>
          <div className="max-w-2xl mx-auto">
            <div className="bg-zinc-900/60 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Your Current Stack</h3>
              </div>
              {TOOL_COMPARISON.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-zinc-200">{item.tool}</span>
                    <span className="text-xs text-zinc-500 ml-2">({item.purpose})</span>
                  </div>
                  <span className="text-zinc-400 font-mono text-sm">{item.cost}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-3 bg-red-500/5 border-t border-red-500/10">
                <span className="text-zinc-300 font-medium">Total</span>
                <span className="text-red-400 font-mono font-bold">$70+/mo</span>
              </div>
            </div>

            <div className="flex items-center justify-center my-6">
              <div className="w-8 h-8 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400 text-lg">
                &#8595;
              </div>
            </div>

            <div className="bg-teal-500/5 border border-teal-500/20 rounded-2xl p-6 text-center">
              <h3 className="text-lg font-semibold text-zinc-100 mb-1">FlashFlow Business</h3>
              <div className="text-3xl font-bold text-teal-400 mb-2">$59/mo</div>
              <p className="text-sm text-zinc-400">Scripts + Pipeline + Analytics + Editing + Team. One platform.</p>
            </div>
          </div>
        </section>

        {/* AI-Native Agencies */}
        <section className="py-16">
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-8 sm:p-12">
            <h2 className="text-3xl font-bold mb-4">AI-native agencies welcome</h2>
            <p className="text-zinc-400 mb-8 max-w-2xl">
              Building a content agency powered entirely by AI? FlashFlow is your production engine.
            </p>
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                { title: 'API Access', desc: 'Generate scripts programmatically. Integrate FlashFlow into your existing automation stack.' },
                { title: 'White-Label Ready', desc: 'Client portals let brands see their content pipeline without seeing your other clients.' },
                { title: 'Bulk Import', desc: 'Import entire product catalogs from TikTok Shop. AI auto-enriches every product.' },
                { title: 'Team Roles', desc: 'Assign scripters, editors, and uploaders. Everyone sees only what they need.' },
              ].map((f) => (
                <div key={f.title} className="flex gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-violet-400 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-zinc-200 mb-1">{f.title}</h3>
                    <p className="text-sm text-zinc-400">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">Scale your agency without scaling your headcount</h2>
          <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
            Start with 5 free scripts. See how FlashFlow fits into your workflow.
          </p>
          <Link href="/login?mode=signup" className="inline-block px-8 py-4 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-lg transition-colors">
            Start Your Agency Trial
          </Link>
        </section>
      </div>
    </PublicLayout>
  );
}
