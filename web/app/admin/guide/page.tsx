"use client";

import { useState } from "react";
import {
  BookOpen,
  Package,
  Sparkles,
  Video,
  Trophy,
  Calendar,
  Users,
  Sun,
  Keyboard,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface GuideSection {
  id: string;
  icon: React.ElementType;
  title: string;
  content: React.ReactNode;
}

const sections: GuideSection[] = [
  {
    id: "getting-started",
    icon: Package,
    title: "1. Getting Started",
    content: (
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
        <div>
          <h4 className="text-white font-semibold mb-2">First Login</h4>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
            <li>Go to your FlashFlow URL and sign up or log in</li>
            <li>You&apos;ll land on the <strong className="text-zinc-200">Dashboard</strong> — your home base</li>
            <li>The sidebar has everything you need</li>
          </ol>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Adding Products</h4>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
            <li>Click <strong className="text-zinc-200">Products</strong> in the sidebar</li>
            <li>Click <strong className="text-zinc-200">Add Product</strong> in the top right</li>
            <li>Fill in name, brand, category, and a detailed description</li>
            <li>The more detail you add, the better your AI scripts will be!</li>
          </ol>
          <div className="mt-2 bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
            <strong className="text-teal-400 text-xs">Shortcut:</strong>{" "}
            <span className="text-zinc-400">Use <Link href="/admin/products/import" className="text-teal-400 hover:underline">Import Products</Link> to paste TikTok Shop URLs for bulk import</span>
          </div>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Creating Audience Personas</h4>
          <p className="text-zinc-400">
            Go to <strong className="text-zinc-200">Audiences</strong> and create personas like &quot;Tired Mom Sarah&quot; or &quot;Fitness Bro Mike&quot;.
            Describe their age, pain points, phrases they use, and what content they love.
            This helps the AI write scripts that <em>feel real</em> to your audience.
          </p>
        </div>
        {/* Screenshot placeholder */}
        <div className="bg-zinc-800 border border-dashed border-zinc-600 rounded-lg p-6 text-center text-zinc-500 text-xs">
          [ Screenshot: Products page with products listed ]
        </div>
      </div>
    ),
  },
  {
    id: "content-studio",
    icon: Sparkles,
    title: "2. Content Studio — Generating Scripts",
    content: (
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
        <div>
          <h4 className="text-white font-semibold mb-2">Quick Generate (Easiest Way)</h4>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
            <li>Go to <strong className="text-zinc-200">Content Studio</strong></li>
            <li>You&apos;ll see <strong className="text-zinc-200">Quick Generate</strong> presets at the top:</li>
          </ol>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            {["Trending Hook", "Pain Point Skit", "Before/After", "Testimonial", "Unboxing", "Day in Life"].map((p) => (
              <div key={p} className="bg-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 text-center">{p}</div>
            ))}
          </div>
          <p className="text-zinc-400 mt-2">Select a product, click any preset, and your script is generated!</p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Full Generate (More Control)</h4>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
            <li>Choose a <strong className="text-zinc-200">Product</strong></li>
            <li>Pick a <strong className="text-zinc-200">Content Type</strong> (skit, story, testimonial...)</li>
            <li>Adjust risk level, duration, hook strength</li>
            <li>Click <strong className="text-zinc-200">Generate</strong></li>
            <li>Review: hook, scene beats, dialogue, CTA</li>
          </ol>
        </div>
        <div className="bg-teal-900/20 border border-teal-700/40 rounded-lg p-3">
          <strong className="text-teal-300 text-xs block mb-1">Tips for Better Scripts</strong>
          <ul className="text-xs text-zinc-400 space-y-1">
            <li>• Add lots of detail to your products — the AI uses everything</li>
            <li>• Use audience personas — scripts with personas feel more real</li>
            <li>• Generate 3 variations and pick the best one</li>
            <li>• Save good scripts to your library</li>
          </ul>
        </div>
        <div className="bg-zinc-800 border border-dashed border-zinc-600 rounded-lg p-6 text-center text-zinc-500 text-xs">
          [ Screenshot: Content Studio with Quick Generate presets ]
        </div>
      </div>
    ),
  },
  {
    id: "pipeline",
    icon: Video,
    title: "3. Pipeline — From Script to Posted",
    content: (
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
        <div>
          <h4 className="text-white font-semibold mb-2">How Videos Flow</h4>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {["SCRIPTED", "ASSIGNED", "IN_PROGRESS", "REVIEW", "APPROVED", "POSTED"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className="bg-zinc-800 px-3 py-1.5 rounded font-mono">{s}</span>
                {i < 5 && <ChevronRight className="w-3 h-3 text-zinc-600" />}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Status Meanings</h4>
          <ul className="space-y-1 text-zinc-400">
            <li><strong className="text-zinc-200">SCRIPTED:</strong> Script written, needs someone to film/edit</li>
            <li><strong className="text-zinc-200">ASSIGNED:</strong> Given to a VA to work on</li>
            <li><strong className="text-zinc-200">IN_PROGRESS:</strong> VA is actively editing</li>
            <li><strong className="text-zinc-200">REVIEW:</strong> VA submitted, needs your approval</li>
            <li><strong className="text-zinc-200">APPROVED:</strong> Ready to post!</li>
            <li><strong className="text-zinc-200">POSTED:</strong> Live on TikTok</li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Adding Scripts to Pipeline</h4>
          <ul className="text-zinc-400 space-y-1">
            <li>• From Content Studio → <strong className="text-zinc-200">Send to Pipeline</strong></li>
            <li>• From Script Library → click the send icon</li>
            <li>• From Script of the Day → <strong className="text-zinc-200">Accept & Add to Pipeline</strong></li>
          </ul>
        </div>
        <div className="bg-zinc-800 border border-dashed border-zinc-600 rounded-lg p-6 text-center text-zinc-500 text-xs">
          [ Screenshot: Pipeline board with status columns ]
        </div>
      </div>
    ),
  },
  {
    id: "winners",
    icon: Trophy,
    title: "4. Winners Bank",
    content: (
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
        <p className="text-zinc-400">
          Winners are your best-performing videos. FlashFlow learns from them to make future scripts even better.
        </p>
        <div>
          <h4 className="text-white font-semibold mb-2">Importing Winners</h4>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
            <li>Go to <strong className="text-zinc-200">Winners Bank → Import</strong></li>
            <li>Paste TikTok video URLs of your best performers</li>
            <li>FlashFlow extracts the hook, metrics, and patterns</li>
          </ol>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Analyzing Patterns</h4>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
            <li>Go to <strong className="text-zinc-200">Winners Bank → Patterns</strong></li>
            <li>Click <strong className="text-zinc-200">Run Analysis</strong></li>
            <li>See: top hook types, best formats, winning formulas</li>
          </ol>
        </div>
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
          <strong className="text-amber-300 text-xs block mb-1">How Winners Improve Scripts</strong>
          <ul className="text-xs text-zinc-400 space-y-1">
            <li>• AI checks Winners Bank during generation</li>
            <li>• Proven hooks and patterns are reused</li>
            <li>• Script of the Day remixes winner hooks with new products</li>
            <li>• You&apos;ll see &quot;Based on winner: [hook]&quot; when this happens</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "calendar",
    icon: Calendar,
    title: "5. Content Calendar & Scheduling",
    content: (
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
        <div>
          <h4 className="text-white font-semibold mb-2">Content Calendar</h4>
          <ul className="text-zinc-400 space-y-1">
            <li>• See your scheduled content on a weekly/monthly view</li>
            <li>• Click any day to add content manually</li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Auto-Fill</h4>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
            <li>Click <strong className="text-zinc-200">Auto-Fill Week</strong></li>
            <li>FlashFlow distributes APPROVED videos across the week</li>
            <li>Max 3 videos per account per day, no duplicate products</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: "va",
    icon: Users,
    title: "6. For VAs (Video Editors)",
    content: (
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
        <p className="text-zinc-400">
          VAs access their work at <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">/va</code> — separate from the admin area.
        </p>
        <div>
          <h4 className="text-white font-semibold mb-2">VA Workflow</h4>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400">
            <li>Go to Available Work and click <strong className="text-zinc-200">Claim</strong></li>
            <li>Read the <strong className="text-zinc-200">Editing Brief</strong> — full script, product info, style notes</li>
            <li>Edit the video following the brief</li>
            <li>Click <strong className="text-zinc-200">Submit for Review</strong></li>
            <li>Wait for approval or revision notes</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: "sotd",
    icon: Sun,
    title: "7. Script of the Day",
    content: (
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
        <p className="text-zinc-400">
          Your daily AI-recommended script. FlashFlow picks the best product + hook combo to film today.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-zinc-400">
          <li>Go to <strong className="text-zinc-200">Script of the Day</strong> (first item in sidebar!)</li>
          <li>See today&apos;s script: product, hook, full script, filming tips</li>
          <li>Use the <strong className="text-zinc-200">Filming Checklist</strong> to prep</li>
          <li>Click <strong className="text-zinc-200">Accept & Add to Pipeline</strong> or <strong className="text-zinc-200">Regenerate</strong></li>
          <li>View previous days&apos; scripts below</li>
        </ol>
      </div>
    ),
  },
  {
    id: "shortcuts",
    icon: Keyboard,
    title: "8. Tips & Keyboard Shortcuts",
    content: (
      <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
        <div>
          <h4 className="text-white font-semibold mb-2">Keyboard Shortcuts</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Cmd/Ctrl + K", "Universal search"],
              ["G then D", "Go to Dashboard"],
              ["G then S", "Go to Content Studio"],
              ["G then P", "Go to Pipeline"],
              ["G then W", "Go to Winners"],
              ["G then C", "Go to Calendar"],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2">
                <kbd className="bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded text-xs font-mono text-zinc-300">{key}</kbd>
                <span className="text-zinc-400 text-xs">{desc}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Power User Tips</h4>
          <ul className="text-zinc-400 space-y-1">
            <li>• <strong className="text-zinc-200">Bulk Operations:</strong> Select multiple items with checkboxes for batch actions</li>
            <li>• <strong className="text-zinc-200">Content Planner:</strong> Generate 20 scripts at once with auto-product selection</li>
            <li>• <strong className="text-zinc-200">Dark/Light Mode:</strong> Toggle in the header</li>
            <li>• <strong className="text-zinc-200">Quick Search:</strong> Cmd+K searches everything — products, scripts, pages</li>
          </ul>
        </div>
      </div>
    ),
  },
];

export default function GuidePage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["getting-started"]));

  const toggle = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(sections.map((s) => s.id)));
  const collapseAll = () => setOpenSections(new Set());

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-teal-400" />
            FlashFlow User Guide
          </h1>
          <p className="text-zinc-400 mt-1">
            Everything you need to start making TikTok content
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 bg-zinc-800 rounded-lg transition-colors">
            Expand All
          </button>
          <button onClick={collapseAll} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 bg-zinc-800 rounded-lg transition-colors">
            Collapse
          </button>
          <a
            href="/guide.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 bg-zinc-800 rounded-lg transition-colors flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Markdown
          </a>
        </div>
      </div>

      {/* Quick nav */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">Jump to</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setOpenSections((prev) => new Set([...prev, s.id]));
                document.getElementById(`guide-${s.id}`)?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <s.icon className="w-3 h-3 text-teal-400" />
              {s.title.replace(/^\d+\.\s*/, "")}
            </button>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((section) => {
          const isOpen = openSections.has(section.id);
          return (
            <div
              key={section.id}
              id={`guide-${section.id}`}
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => toggle(section.id)}
                className="w-full flex items-center gap-3 p-5 text-left hover:bg-zinc-800/50 transition-colors"
              >
                <section.icon className="w-5 h-5 text-teal-400 shrink-0" />
                <span className="font-semibold flex-1">{section.title}</span>
                <ChevronDown
                  className={`w-4 h-4 text-zinc-500 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-0 border-t border-zinc-800 mt-0 pt-4">
                  {section.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
