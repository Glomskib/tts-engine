'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Package,
  UserCheck,
  Sparkles,
  Trophy,
  Calendar,
  Activity,
  Video,
  FileText,
  Mic,
  Lightbulb,
  Wallet,
  Building,
  Send,
  Eye,
  HelpCircle,
  MessageSquare,
  Play,
  ChevronRight,
  CheckCircle2,
  Circle,
  Mail,
  ExternalLink,
} from 'lucide-react';

// ─── Step tracker (persisted in localStorage) ────────────────────────────────

const STEPS = [
  { key: 'product', label: 'Add a product', href: '/admin/products', icon: Package },
  { key: 'persona', label: 'Create a customer archetype', href: '/admin/audience', icon: UserCheck },
  { key: 'studio', label: 'Open Content Studio', href: '/admin/content-studio', icon: Sparkles },
  { key: 'generate', label: 'Generate & save a script', href: '/admin/content-studio', icon: FileText },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

function useCompletedSteps() {
  const STORAGE_KEY = 'ffai-guide-steps';
  const [completed, setCompleted] = useState<Set<StepKey>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw) as StepKey[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggle = (key: StepKey) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return { completed, toggle };
}

// ─── Quick Links data ────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { name: 'Content Studio', href: '/admin/content-studio', icon: Sparkles, desc: 'Generate AI scripts in 60 seconds' },
  { name: 'Script Library', href: '/admin/skit-library', icon: FileText, desc: 'Browse and manage saved scripts' },
  { name: 'Products', href: '/admin/products', icon: Package, desc: 'Add and manage your product catalog' },
  { name: 'Customer Archetypes', href: '/admin/audience', icon: UserCheck, desc: 'Create target audience personas' },
  { name: 'Winners Bank', href: '/admin/winners', icon: Trophy, desc: 'Study top-performing viral content' },
  { name: 'Content Calendar', href: '/admin/calendar', icon: Calendar, desc: 'Plan and schedule your posts' },
  { name: 'Production Board', href: '/admin/pipeline', icon: Video, desc: 'Track videos from script to posted' },
  { name: 'Transcriber', href: '/admin/transcribe', icon: Mic, desc: 'Convert TikTok videos to scripts' },
  { name: 'Content Ideas', href: '/admin/content-ideas', icon: Lightbulb, desc: 'AI-recommended scripts and angles' },
  { name: 'Patterns', href: '/admin/winners/patterns', icon: Activity, desc: 'Analyze what makes winners win' },
  { name: 'Brands', href: '/admin/brands', icon: Building, desc: 'Manage brand partnerships' },
  { name: 'Billing & Credits', href: '/admin/billing', icon: Wallet, desc: 'Manage your plan and credits' },
] as const;

// ─── Tutorial placeholders ───────────────────────────────────────────────────

const TUTORIALS = [
  { title: 'Getting Started with FlashFlow', duration: '3:45' },
  { title: 'Generate Your First Script', duration: '2:30' },
  { title: 'Using Winners Bank', duration: '4:15' },
  { title: 'Setting Up Your Content Pipeline', duration: '5:00' },
  { title: 'Mastering Customer Archetypes', duration: '3:20' },
  { title: 'Content Calendar Deep Dive', duration: '4:50' },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  const { completed, toggle } = useCompletedSteps();
  const completedCount = completed.size;
  const totalSteps = STEPS.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);

  return (
    <div className="max-w-4xl mx-auto pb-24 lg:pb-8 space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Getting Started</h1>
            <p className="text-sm text-zinc-500">Your interactive guide to FlashFlow</p>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — YOUR FIRST SCRIPT IN 60 SECONDS
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Your First Script in 60 Seconds</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Complete these four steps to generate your first AI-powered TikTok script.
        </p>

        {/* Progress bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
            <span>{completedCount} of {totalSteps} complete</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const done = completed.has(step.key);
            const Icon = step.icon;
            return (
              <div
                key={step.key}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                  done
                    ? 'bg-teal-500/5 border-teal-500/20'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Check toggle */}
                <button
                  type="button"
                  onClick={() => toggle(step.key)}
                  className="shrink-0"
                  aria-label={done ? `Mark "${step.label}" incomplete` : `Mark "${step.label}" complete`}
                >
                  {done ? (
                    <CheckCircle2 className="w-6 h-6 text-teal-400" />
                  ) : (
                    <Circle className="w-6 h-6 text-zinc-600" />
                  )}
                </button>

                {/* Step number + icon */}
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-zinc-400" />
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-zinc-500 font-medium">Step {i + 1}</span>
                  <p className={`text-sm font-medium ${done ? 'text-zinc-500 line-through' : 'text-white'}`}>
                    {step.label}
                  </p>
                </div>

                {/* Link */}
                <Link
                  href={step.href}
                  className="shrink-0 flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
                >
                  Go <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            );
          })}
        </div>

        {completedCount === totalSteps && (
          <div className="mt-4 p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl text-center">
            <p className="text-sm font-semibold text-teal-400">You&apos;re all set! You&apos;ve completed the basics.</p>
            <p className="text-xs text-zinc-400 mt-1">Keep going below to level up your content game.</p>
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — LEVEL UP YOUR CONTENT
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Level Up Your Content</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Once you&apos;ve got the basics down, use these tools to produce content faster and smarter.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Winners Bank */}
          <Link
            href="/admin/winners"
            className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-amber-500/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center mb-3">
              <Trophy className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-amber-400 transition-colors">
              Study What Works
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Import your best TikToks into Winners Bank. FlashFlow analyzes hooks, formats, and patterns so you can replicate what converts.
            </p>
          </Link>

          {/* Content Calendar */}
          <Link
            href="/admin/calendar"
            className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-blue-500/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center mb-3">
              <Calendar className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
              Stay Consistent
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Plan your posts with the Content Calendar. Schedule across brands, auto-fill your week, and never miss a posting day.
            </p>
          </Link>

          {/* Retainer Tracking */}
          <Link
            href="/admin/brands"
            className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-violet-500/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center mb-3">
              <Building className="w-4.5 h-4.5 text-violet-400" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-violet-400 transition-colors">
              Track Retainer Progress
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Monitor brand partnership goals, see videos remaining to hit quota, and track bonus tier progress.
            </p>
          </Link>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 — QUICK LINKS
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Quick Links</h2>
        <p className="text-sm text-zinc-500 mb-4">Jump to any feature.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
              >
                <Icon className="w-5 h-5 text-teal-400 mb-2 group-hover:text-teal-300 transition-colors" />
                <p className="text-sm font-medium text-white mb-0.5">{link.name}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{link.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 — VIDEO TUTORIALS (PLACEHOLDER)
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Video Tutorials</h2>
        <p className="text-sm text-zinc-500 mb-4">Watch step-by-step walkthroughs of every feature.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TUTORIALS.map((tut) => (
            <div
              key={tut.title}
              className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
            >
              {/* Thumbnail placeholder */}
              <div className="aspect-video bg-zinc-800 flex items-center justify-center relative">
                <Play className="w-8 h-8 text-zinc-600" />
                {/* Coming soon badge */}
                <span className="absolute top-2 right-2 px-2 py-0.5 bg-zinc-700 text-zinc-400 text-[10px] font-semibold rounded-full uppercase tracking-wider">
                  Coming soon
                </span>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-zinc-300">{tut.title}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{tut.duration}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 5 — NEED HELP?
          ════════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Need Help?</h2>
        <p className="text-sm text-zinc-500 mb-4">We&apos;re here for you.</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/help"
            className="group flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-teal-500/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4.5 h-4.5 text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-teal-400 transition-colors">AI Help Bot</p>
              <p className="text-xs text-zinc-500">Chat with our AI assistant</p>
            </div>
          </Link>

          <Link
            href="/admin/help"
            className="group flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-blue-500/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">Submit a Ticket</p>
              <p className="text-xs text-zinc-500">Report bugs or request features</p>
            </div>
          </Link>

          <a
            href="mailto:hello@flashflowai.com"
            className="group flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-violet-500/30 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
              <Mail className="w-4.5 h-4.5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-violet-400 transition-colors">Email Us</p>
              <p className="text-xs text-zinc-500">hello@flashflowai.com</p>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
