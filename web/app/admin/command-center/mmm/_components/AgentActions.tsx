'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wand2, Megaphone, Search, FileText, Calendar } from 'lucide-react';

type ActionKey = 'fff-thanks' | 'hhh-save-the-date' | 'hhh-sponsor-call' | 'weekly-digest' | 'research' | 'summary';

interface ActionDef {
  key: ActionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  body?: () => Record<string, unknown>;
  requiresInput?: 'event_name' | 'filename';
}

const ACTIONS: ActionDef[] = [
  {
    key: 'fff-thanks',
    label: 'Draft FFF thank-you',
    icon: Megaphone,
    endpoint: '/api/admin/mmm/agent/draft-post',
    body: () => ({ event_slug: 'fff-2026', post_type: 'thank-you' }),
  },
  {
    key: 'hhh-save-the-date',
    label: 'Draft HHH save-the-date',
    icon: Megaphone,
    endpoint: '/api/admin/mmm/agent/draft-post',
    body: () => ({ event_slug: 'hhh-2026', post_type: 'save-the-date' }),
  },
  {
    key: 'hhh-sponsor-call',
    label: 'Draft HHH sponsor call',
    icon: Megaphone,
    endpoint: '/api/admin/mmm/agent/draft-post',
    body: () => ({ event_slug: 'hhh-2026', post_type: 'sponsor-call' }),
  },
  {
    key: 'weekly-digest',
    label: 'Generate weekly digest',
    icon: Calendar,
    endpoint: '/api/admin/mmm/agent/weekly-digest',
    body: () => ({}),
  },
  {
    key: 'research',
    label: 'Research a bike event',
    icon: Search,
    endpoint: '/api/admin/mmm/agent/research-note',
    requiresInput: 'event_name',
  },
  {
    key: 'summary',
    label: 'Summarize latest meeting note',
    icon: FileText,
    endpoint: '/api/admin/mmm/agent/meeting-summary',
    body: () => ({}),
  },
];

export function AgentActions() {
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [showResearchInput, setShowResearchInput] = useState(false);
  const [researchInput, setResearchInput] = useState('');
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function trigger(action: ActionDef, override?: Record<string, unknown>) {
    setRunning(action.key);
    setMessage({ tone: 'info', text: `Asking Miles to ${action.label.toLowerCase()}…` });
    try {
      const body = override || (action.body ? action.body() : {});
      const res = await fetch(action.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: 'err', text: json.message || `Failed (${res.status})` });
        return;
      }
      setMessage({ tone: 'ok', text: `Drafted. Awaiting approval — see Needs Approval.` });
      startTransition(() => router.refresh());
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setRunning(null);
    }
  }

  function handleClick(action: ActionDef) {
    if (action.requiresInput === 'event_name') {
      setShowResearchInput(true);
      return;
    }
    void trigger(action);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Wand2 className="w-3.5 h-3.5 text-violet-400" />
        Trigger Bolt / Miles. Output lands in Needs Approval. Nothing publishes automatically.
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          const isRunning = running === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => handleClick(a)}
              disabled={!!running}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-950/40 text-left text-xs text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400 flex-shrink-0" />
              ) : (
                <Icon className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
              )}
              <span className="truncate">{a.label}</span>
            </button>
          );
        })}
      </div>

      {showResearchInput ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 flex items-center gap-2">
          <input
            type="text"
            value={researchInput}
            onChange={(e) => setResearchInput(e.target.value)}
            placeholder="Bike event name (e.g. Gravel Worlds)"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
          <button
            type="button"
            onClick={() => {
              if (!researchInput.trim()) return;
              const action = ACTIONS.find((a) => a.key === 'research')!;
              setShowResearchInput(false);
              void trigger(action, { event_name: researchInput.trim() });
              setResearchInput('');
            }}
            disabled={!researchInput.trim() || running === 'research'}
            className="px-2 py-1 rounded bg-violet-500/15 border border-violet-500/30 text-xs text-violet-300 hover:bg-violet-500/25 disabled:opacity-40"
          >
            Research
          </button>
          <button
            type="button"
            onClick={() => {
              setShowResearchInput(false);
              setResearchInput('');
            }}
            className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {message ? (
        <div
          className={`text-xs ${
            message.tone === 'ok'
              ? 'text-emerald-300'
              : message.tone === 'err'
                ? 'text-rose-300'
                : 'text-zinc-400'
          }`}
        >
          {message.text}
        </div>
      ) : null}
    </div>
  );
}
