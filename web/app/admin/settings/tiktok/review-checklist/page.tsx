'use client';

import { useState } from 'react';
import AdminPageLayout, { AdminCard, AdminButton } from '../../../components/AdminPageLayout';
import {
  CheckCircle2,
  Circle,
  ArrowLeft,
  AlertTriangle,
  Video,
  Link2,
  ShoppingBag,
  Database,
  Unlink,
  Trash2,
} from 'lucide-react';

interface ChecklistStep {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: ChecklistStep[] = [
  {
    id: 1,
    title: 'Demo Login Kit Connect',
    description:
      'Show clicking "Connect TikTok" in the Login Kit section, completing the OAuth flow, and returning with a green Connected badge showing the user\'s display name and avatar.',
    icon: <Link2 className="w-4 h-4" />,
  },
  {
    id: 2,
    title: 'Show Integration Overview',
    description:
      'Show the Integration Overview card at the top with all 4 integrations (Login Kit, Partner API, Shop, Content Posting) displaying green "Connected" status. Then scroll through each individual section.',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  {
    id: 3,
    title: 'Sync Products from Shop',
    description:
      'Click "Sync Products" in the header, wait for the sync banner to appear showing created/updated counts, and scroll through the product table.',
    icon: <ShoppingBag className="w-4 h-4" />,
  },
  {
    id: 4,
    title: 'Show Content Posting Section',
    description:
      'Scroll to the Content Posting card showing connected TikTok accounts with their handles, privacy levels, and token expiry dates.',
    icon: <Video className="w-4 h-4" />,
  },
  {
    id: 5,
    title: 'Show Data Controls Panel',
    description:
      'Scroll to the Data Controls card. Show the "Data Stored" table, "How to Disable" instructions, "Data Retention" policy, and the "Delete All TikTok Data" button.',
    icon: <Database className="w-4 h-4" />,
  },
  {
    id: 6,
    title: 'Demo Disconnect Flow',
    description:
      'Disconnect one integration (e.g., Content Posting). Show the confirmation dialog, then the status changing from connected to disconnected. Reconnect it afterward.',
    icon: <Unlink className="w-4 h-4" />,
  },
  {
    id: 7,
    title: 'Demo Data Deletion',
    description:
      'Click "Delete All TikTok Data" in the Data Controls section. Show the confirmation dialog explaining what will be deleted. Cancel (or proceed on a test account) to show the flow works end-to-end.',
    icon: <Trash2 className="w-4 h-4" />,
  },
];

export default function ReviewChecklistPage() {
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const progress = Math.round((completed.size / STEPS.length) * 100);

  return (
    <AdminPageLayout
      title="TikTok Review Checklist"
      subtitle="Loom demo walkthrough for TikTok developer app submission"
      headerActions={
        <AdminButton
          variant="ghost"
          onClick={() => (window.location.href = '/admin/settings/tiktok')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to TikTok Settings
        </AdminButton>
      }
    >
      {/* Progress Bar */}
      <AdminCard>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-300 font-medium">
              {completed.size} of {STEPS.length} steps completed
            </span>
            <span className="text-zinc-500">{progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </AdminCard>

      {/* Checklist Steps */}
      <AdminCard title="Demo Steps" subtitle="Toggle each step as you record your Loom walkthrough">
        <div className="space-y-1">
          {STEPS.map((step) => {
            const done = completed.has(step.id);
            return (
              <button
                key={step.id}
                onClick={() => toggle(step.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  done
                    ? 'bg-emerald-500/5 border border-emerald-500/20'
                    : 'bg-zinc-900/50 border border-white/5 hover:border-white/10'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${done ? 'text-emerald-300' : 'text-zinc-200'}`}>
                      {step.id}. {step.title}
                    </span>
                    <span className="text-zinc-600">{step.icon}</span>
                  </div>
                  <p className={`text-xs mt-1 ${done ? 'text-emerald-400/60' : 'text-zinc-500'}`}>
                    {step.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </AdminCard>

      {/* Test Account Notes */}
      <AdminCard title="Test Account Notes" subtitle="Environment setup for the review demo">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-300">Use a test/staging environment for the Loom recording.</p>
              <p className="text-xs text-amber-400/70 mt-1">
                Do not demo data deletion on production data.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-zinc-500">
            <p>
              <span className="text-zinc-300 font-medium">Enable review mode:</span> Set{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">
                NEXT_PUBLIC_TIKTOK_REVIEW_MODE=true
              </code>{' '}
              in your environment variables. This shows the amber review banner and this checklist link on the TikTok settings page.
            </p>
            <p>
              <span className="text-zinc-300 font-medium">Test accounts:</span> Ensure you have at least one TikTok account connected for each integration (Login Kit, Shop, Content Posting) before recording.
            </p>
            <p>
              <span className="text-zinc-300 font-medium">Recording tips:</span> Keep the Loom under 5 minutes. Narrate each step. Pause briefly on the Data Controls section to show the full panel.
            </p>
          </div>
        </div>
      </AdminCard>
    </AdminPageLayout>
  );
}
