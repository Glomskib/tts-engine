'use client';

import { useState } from 'react';
import {
  Sparkles, Video, Trophy, Package, BarChart3, Users, Settings, FileText,
  ChevronDown, ChevronRight, ExternalLink, Zap, Calendar, FlaskConical,
} from 'lucide-react';

interface HelpSection {
  id: string;
  icon: any;
  title: string;
  description: string;
  steps: string[];
  tips?: string[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'content-studio',
    icon: Sparkles,
    title: 'Content Studio',
    description: 'Generate AI-powered TikTok scripts from your product catalog.',
    steps: [
      'Select a product from the dropdown (or search by name/brand)',
      'Choose a content type: product showcase, UGC testimonial, skit/comedy, voiceover, or face-on-camera',
      'Optionally select a persona to target a specific audience',
      'Click "Generate Script" — AI creates hook, scene beats, and CTA',
      'Review the AI Score (8+/10 auto-saves to Winners Bank)',
      'Edit any scene inline by clicking on it',
      'Use "Regenerate" for a fresh take or "AI Chat" to refine specific parts',
      'Save to Script Library or download as .txt/.docx',
    ],
    tips: [
      'Higher-rated scripts (8+) automatically land in Winners Bank',
      'Use the "Saved Hooks" drawer to reuse proven hooks',
      'Content type affects tone, pacing, and structure',
    ],
  },
  {
    id: 'pipeline',
    icon: Video,
    title: 'Production Board',
    description: 'Track every video from script to posted — the production command center.',
    steps: [
      'Videos enter the pipeline when created from Content Studio or manually added',
      'Status flow: SCRIPTED → ASSIGNED → EDITING → REVIEW → APPROVED → POSTED',
      'Use filters (status, brand, assignee, priority) to find specific videos',
      'Click a video card to see full details, script, and status history',
      'Assign videos to VAs by clicking "Assign" and selecting a team member',
      'When a VA submits work, status moves to REVIEW for your approval',
      'Approve or reject with revision notes — rejected returns to EDITING',
    ],
    tips: [
      'Priority score auto-calculates based on brand quota, age, and product demand',
      'SLA timer shows how long each video has been in its current status',
      'Sort by "SLA Deadline" to see what needs attention first',
    ],
  },
  {
    id: 'winners-bank',
    icon: Trophy,
    title: 'Winners Bank',
    description: 'Your collection of proven hooks and scripts that drive results.',
    steps: [
      'Winners are added automatically when AI scores 8+, or manually from any script',
      'Each winner stores: hook, full script, format, hook type, views, engagement',
      'Use filters to find winners by source, hook type, format, category, or score',
      'Click a winner to see full details and performance data',
      'Use "Remix" to create 5 new angle variations from any winner',
      'Winners feed into AI generation — better winners = better new scripts',
    ],
    tips: [
      'Tag hook types accurately — this trains the AI on what works',
      'External winners (competitor content) are valuable for pattern learning',
      'The analytics tab shows which hook types and formats perform best',
    ],
  },
  {
    id: 'products',
    icon: Package,
    title: 'Products & Brands',
    description: 'Manage your product catalog and brand configurations.',
    steps: [
      'Add products with name, brand, description, benefits, and pain points',
      'Each product can have multiple scripts generated against it',
      'Brands group products — set monthly video quotas per brand',
      'Brand quotas auto-track as videos move to POSTED status',
      'Use the product page sort/filter to find specific items',
    ],
    tips: [
      'Detailed pain points and benefits improve AI script quality significantly',
      'Create products with unique selling propositions for best results',
    ],
  },
  {
    id: 'accounts',
    icon: Users,
    title: 'Posting Accounts',
    description: 'Manage TikTok accounts and posting distribution.',
    steps: [
      'Add posting accounts with display name and code (e.g. BKADV0)',
      'Toggle accounts active/inactive to control posting distribution',
      'View per-account performance: videos, views, engagement, revenue',
      'Use posting-scheduler.py to auto-distribute ready videos across accounts',
      'Each account card links to its pipeline and performance pages',
    ],
  },
  {
    id: 'analytics',
    icon: BarChart3,
    title: 'Analytics & Performance',
    description: 'Four analytics views: Content, Pipeline, Winners, and Performance.',
    steps: [
      'Content tab: scripts created, videos completed, credits used, conversion funnel',
      'Pipeline tab: stage durations (SLA), daily throughput, user productivity',
      'Winners tab: win rate, top hook types, engagement patterns, recommendations',
      'Performance tab: throughput chart, revenue by brand, hook effectiveness, VA stats',
      'Change time window (7/14/30 days) to see different periods',
      'Export any data as CSV for external analysis',
    ],
  },
  {
    id: 'ab-tests',
    icon: FlaskConical,
    title: 'A/B Tests',
    description: 'Test different hooks and scripts against each other.',
    steps: [
      'Create a test by selecting two script variants for the same product',
      'Each variant gets assigned to a posting account',
      'Track views, engagement, and conversion for each variant',
      'The system auto-detects winners based on statistical significance',
      'Winning variants get promoted to Winners Bank',
    ],
  },
  {
    id: 'calendar',
    icon: Calendar,
    title: 'Content Calendar',
    description: 'Visual overview of your posting schedule.',
    steps: [
      'Calendar shows all pipeline videos by their target post date',
      'Drag and drop to reschedule videos',
      'Color-coded by status: blue (scripted), yellow (editing), green (ready), purple (posted)',
      'Click any item to jump to its pipeline detail',
    ],
  },
  {
    id: 'automation',
    icon: Zap,
    title: 'Automation & Scripts',
    description: 'Background scripts that run your content engine 24/7.',
    steps: [
      'content-pipeline.py: End-to-end content creation (research → generate → score → queue)',
      'hook-factory.py: Bulk hook generation using local LLM (30 hooks per run)',
      'winner-remixer.py: Create 5 angle variations from any winning content',
      'va-brief-generator.py: Auto-generate editing briefs for scripted videos',
      'va-sla-tracker.py: Monitor VA turnaround times and SLA compliance',
      'posting-scheduler.py: Distribute ready videos across posting accounts',
      'All scripts auto-find API keys from OpenClaw config',
    ],
    tips: [
      'Scripts in /scripts/ directory — run with python3',
      'Most scripts have --dry-run mode for safe previewing',
      'Cron jobs run automatically via OpenClaw (see Automation page)',
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    title: 'Settings & API Keys',
    description: 'Account settings, API keys, and team management.',
    steps: [
      'API Keys tab: create keys for external integrations (OpenClaw, scripts)',
      'Key format: ff_ak_<40 chars> — copy immediately, shown only once',
      'Scopes: read, write, admin — control what each key can do',
      'Revoke keys anytime — they stop working immediately',
      'Team Members: manage VA access and roles',
    ],
  },
];

export default function AdminHelpPage() {
  const [expandedSection, setExpandedSection] = useState<string | null>('content-studio');

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }} className="pb-24 lg:pb-6">
      <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#fff' }}>Help Center</h1>
      <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#71717a' }}>
        Learn how to use FlashFlow AI to create, manage, and optimize TikTok content at scale.
      </p>

      {/* Quick Start */}
      <div style={{
        backgroundColor: '#18181b',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '24px',
      }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#60a5fa' }}>Quick Start</h2>
        <ol style={{ margin: 0, paddingLeft: '20px', color: '#d4d4d8', fontSize: '14px', lineHeight: '1.8' }}>
          <li>Add products in <strong>Products</strong> (name, brand, benefits, pain points)</li>
          <li>Generate scripts in <strong>Content Studio</strong> (select product → generate)</li>
          <li>Save high-scoring scripts to <strong>Script Library</strong></li>
          <li>Queue videos in <strong>Pipeline</strong> and assign to VAs</li>
          <li>VAs edit in the <strong>VA Dashboard</strong> (/va) and submit for review</li>
          <li>Approve and post — track results in <strong>Analytics</strong></li>
        </ol>
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {HELP_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSection === section.id;

          return (
            <div
              key={section.id}
              style={{
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                style={{
                  width: '100%',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#e4e4e7',
                  textAlign: 'left',
                }}
              >
                <Icon size={20} style={{ color: '#71717a', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{section.title}</div>
                  <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>{section.description}</div>
                </div>
                {isExpanded ? <ChevronDown size={16} style={{ color: '#71717a' }} /> : <ChevronRight size={16} style={{ color: '#71717a' }} />}
              </button>

              {isExpanded && (
                <div style={{ padding: '0 16px 16px 48px' }}>
                  <ol style={{ margin: '0 0 12px 0', paddingLeft: '20px', color: '#a1a1aa', fontSize: '13px', lineHeight: '1.8' }}>
                    {section.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {section.tips && (
                    <div style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: '6px',
                      padding: '12px',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>Tips</div>
                      <ul style={{ margin: 0, paddingLeft: '16px', color: '#93c5fd', fontSize: '12px', lineHeight: '1.6' }}>
                        {section.tips.map((tip, i) => (
                          <li key={i}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Keyboard Shortcuts */}
      <div style={{
        backgroundColor: '#18181b',
        border: '1px solid #27272a',
        borderRadius: '8px',
        padding: '20px',
        marginTop: '24px',
      }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#e4e4e7' }}>Useful Links</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[
            { label: 'VA Dashboard', href: '/va' },
            { label: 'Content Studio', href: '/admin/content-studio' },
            { label: 'Pipeline', href: '/admin/pipeline' },
            { label: 'Analytics', href: '/admin/analytics' },
            { label: 'Winners Bank', href: '/admin/winners-bank' },
            { label: 'Settings', href: '/admin/settings' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              style={{
                padding: '10px 14px',
                backgroundColor: '#27272a',
                borderRadius: '6px',
                color: '#a1a1aa',
                textDecoration: 'none',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <ExternalLink size={12} />
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
