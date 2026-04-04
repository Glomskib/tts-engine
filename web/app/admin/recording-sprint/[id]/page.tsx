'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import AdminPageLayout, { AdminCard, AdminButton } from '@/app/admin/components/AdminPageLayout';
import { SkeletonAuthCheck } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';

// ── Types ───────────────────────────────────────────────────────────

interface SprintContentItem {
  id: string;
  title: string;
  status: string;
  primary_hook: string | null;
  script_text: string | null;
  script_json: Record<string, unknown> | null;
  raw_video_url: string | null;
  raw_footage_url: string | null;
  drive_folder_id: string | null;
}

interface SprintItem {
  id: string;
  content_item_id: string;
  sort_order: number;
  status: 'pending' | 'recording' | 'recorded' | 'skipped';
  recorded_at: string | null;
  content_item: SprintContentItem[] | null;
  creative_hook: string | null;
  creative_angle: string | null;
  creative_persona: string | null;
}

interface Sprint {
  id: string;
  workspace_id: string;
  experiment_id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  total_items: number;
  completed_items: number;
  skipped_items: number;
  current_index: number;
  timer_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  items: SprintItem[];
  experiments: { name: string; product_id: string | null }[] | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseScriptSections(scriptText: string | null): Array<{ type: string; text: string }> {
  if (!scriptText) return [];
  const sections: Array<{ type: string; text: string }> = [];
  const lines = scriptText.split('\n');
  let currentType = 'body';
  let currentText = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect section headers
    const headerMatch = trimmed.match(/^\[(\w+)\]\s*(.*)/i);
    if (headerMatch) {
      if (currentText) sections.push({ type: currentType, text: currentText.trim() });
      currentType = headerMatch[1].toLowerCase();
      currentText = headerMatch[2] || '';
    } else {
      currentText += (currentText ? '\n' : '') + trimmed;
    }
  }
  if (currentText) sections.push({ type: currentType, text: currentText.trim() });
  return sections.length > 0 ? sections : [{ type: 'body', text: scriptText }];
}

const SECTION_STYLES: Record<string, { label: string; color: string }> = {
  hook: { label: 'Hook', color: 'text-emerald-400' },
  beat: { label: 'Beat', color: 'text-blue-400' },
  cta: { label: 'CTA', color: 'text-amber-400' },
  body: { label: 'Script', color: 'text-zinc-300' },
  overlay: { label: 'Overlay', color: 'text-violet-400' },
  note: { label: 'Note', color: 'text-zinc-500' },
};

// ── Page ────────────────────────────────────────────────────────────

export default function RecordingSprintPage() {
  const router = useRouter();
  const params = useParams();
  const sprintId = params.id as string;
  const { showSuccess, showError } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showScript, setShowScript] = useState(false);

  // Timer state
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) { router.push('/login'); return; }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        if (roleData.role !== 'admin') { router.push('/admin/pipeline'); return; }
        setIsAdmin(true);
      } catch {
        router.push('/login');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Fetch sprint
  const fetchSprint = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/recording-sprints/${sprintId}`);
      const json = await res.json();
      if (json.ok) {
        setSprint(json.data);
        // Initialize timer if sprint has timer_minutes
        if (json.data.timer_minutes && timerSeconds === 0) {
          setTimerSeconds(json.data.timer_minutes * 60);
        }
      } else {
        showError('Sprint not found');
        router.push('/admin/experiments');
      }
    } catch {
      showError('Failed to load sprint');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprintId, router]);

  useEffect(() => {
    if (isAdmin) fetchSprint();
  }, [isAdmin, fetchSprint]);

  // Timer countdown
  useEffect(() => {
    if (timerActive && timerSeconds > 0) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            setTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive, timerSeconds]);

  // ── Actions ────────────────────────────────────────────────────────

  const sprintAction = async (action: string, itemId?: string, extra?: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/recording-sprints/${sprintId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, item_id: itemId, ...extra }),
      });
      const json = await res.json();
      if (json.ok) {
        await fetchSprint();
        if (action === 'mark_recorded') {
          showSuccess('Recorded!');
          if (json.data?.is_complete) showSuccess('Sprint complete!');
        }
        if (action === 'skip') showSuccess('Skipped');
      } else {
        showError(json.error || 'Action failed');
      }
    } catch {
      showError('Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const navigateTo = (index: number) => {
    sprintAction('navigate', undefined, { index });
  };

  if (authLoading) return <SkeletonAuthCheck />;
  if (!isAdmin) return null;
  if (loading || !sprint) {
    return (
      <AdminPageLayout title="Loading..." stage="production">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminPageLayout>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────

  const experimentName = Array.isArray(sprint.experiments) ? sprint.experiments[0]?.name : '';
  const currentItem = sprint.items[sprint.current_index];
  const ci = currentItem ? (Array.isArray(currentItem.content_item) ? currentItem.content_item[0] : currentItem.content_item) : null;
  const hookText = currentItem?.creative_hook || ci?.primary_hook || '(no hook)';
  const scriptSections = parseScriptSections(ci?.script_text || null);
  const doneCount = sprint.completed_items + sprint.skipped_items;
  const progressPct = sprint.total_items > 0 ? (doneCount / sprint.total_items) * 100 : 0;
  const isComplete = sprint.status === 'completed' || doneCount >= sprint.total_items;

  // ── Completed View ─────────────────────────────────────────────────

  if (isComplete) {
    return (
      <AdminPageLayout
        title="Sprint Complete"
        subtitle={experimentName}
        stage="production"
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Experiments', href: '/admin/experiments' },
          { label: 'Sprint Complete' },
        ]}
      >
        <AdminCard>
          <div className="text-center py-8 space-y-4">
            <div className="text-4xl">&#10003;</div>
            <h2 className="text-lg font-semibold text-zinc-200">Recording Sprint Done</h2>
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              <div>
                <div className="text-2xl font-bold text-emerald-400">{sprint.completed_items}</div>
                <div className="text-[11px] text-zinc-500">Recorded</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-zinc-400">{sprint.skipped_items}</div>
                <div className="text-[11px] text-zinc-500">Skipped</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{sprint.total_items}</div>
                <div className="text-[11px] text-zinc-500">Total</div>
              </div>
            </div>
            <div className="flex justify-center gap-3 pt-4">
              <Link href="/admin/experiments">
                <AdminButton variant="secondary" size="sm">Back to Experiments</AdminButton>
              </Link>
              <Link href="/admin/pipeline">
                <AdminButton variant="primary" size="sm">View Pipeline</AdminButton>
              </Link>
            </div>
          </div>
        </AdminCard>
      </AdminPageLayout>
    );
  }

  // ── Sprint Player ──────────────────────────────────────────────────

  return (
    <AdminPageLayout
      title="Recording Sprint"
      subtitle={experimentName}
      stage="production"
      maxWidth="lg"
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Experiments', href: '/admin/experiments' },
        { label: 'Sprint' },
      ]}
      headerActions={
        <div className="flex items-center gap-2">
          {sprint.timer_minutes && (
            <button
              onClick={() => setTimerActive(!timerActive)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                timerSeconds <= 60 && timerActive
                  ? 'border-red-500/50 text-red-400 bg-red-500/10'
                  : 'border-zinc-700 text-zinc-400 bg-zinc-800'
              }`}
            >
              {formatTime(timerSeconds)} {timerActive ? '||' : '\u25B6'}
            </button>
          )}
          <AdminButton
            variant="secondary"
            size="sm"
            onClick={() => sprintAction(sprint.status === 'paused' ? 'resume' : 'pause')}
          >
            {sprint.status === 'paused' ? 'Resume' : 'Pause'}
          </AdminButton>
          <AdminButton
            variant="danger"
            size="sm"
            onClick={() => sprintAction('complete')}
          >
            End Sprint
          </AdminButton>
        </div>
      }
    >
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Progress</span>
          <span className="text-zinc-400 font-medium tabular-nums">
            {sprint.current_index + 1} / {sprint.total_items}
          </span>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {/* Item dots */}
        <div className="flex gap-1 flex-wrap">
          {sprint.items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => navigateTo(i)}
              className={`w-5 h-5 rounded text-[9px] font-medium transition-colors ${
                i === sprint.current_index
                  ? 'bg-teal-500 text-white'
                  : item.status === 'recorded'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : item.status === 'skipped'
                  ? 'bg-zinc-700 text-zinc-500'
                  : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
              }`}
              title={`Item ${i + 1}: ${item.status}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Current item card */}
      {currentItem && ci && (
        <AdminCard>
          <div className="space-y-4">
            {/* Item header */}
            <div className="flex items-start justify-between">
              <div>
                {currentItem.creative_angle && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-violet-400/10 text-violet-400 border border-violet-400/20 mb-2">
                    {currentItem.creative_angle}
                  </span>
                )}
                {currentItem.creative_persona && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-400/10 text-blue-400 border border-blue-400/20 mb-2 ml-1.5">
                    {currentItem.creative_persona}
                  </span>
                )}
                <div className="text-xs text-zinc-500">{ci.title}</div>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                currentItem.status === 'recorded'
                  ? 'bg-emerald-400/10 text-emerald-400'
                  : currentItem.status === 'skipped'
                  ? 'bg-zinc-700 text-zinc-500'
                  : 'bg-teal-400/10 text-teal-400'
              }`}>
                {currentItem.status}
              </span>
            </div>

            {/* Hook — prominent display */}
            <div className="bg-zinc-800/80 rounded-xl p-5 border border-white/[0.06]">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">Hook</div>
              <div className="text-lg font-medium text-zinc-100 leading-relaxed">
                &ldquo;{hookText}&rdquo;
              </div>
            </div>

            {/* Script toggle */}
            <div>
              <button
                onClick={() => setShowScript(!showScript)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
              >
                <span className={`transition-transform ${showScript ? 'rotate-90' : ''}`}>&#9654;</span>
                Script preview
              </button>
              {showScript && scriptSections.length > 0 && (
                <div className="mt-3 space-y-2 pl-4 border-l border-white/[0.06]">
                  {scriptSections.map((section, i) => {
                    const style = SECTION_STYLES[section.type] || SECTION_STYLES.body;
                    return (
                      <div key={i}>
                        <div className={`text-[10px] uppercase tracking-wider ${style.color} mb-0.5`}>
                          {style.label}
                        </div>
                        <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
                          {section.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {showScript && scriptSections.length === 0 && (
                <div className="mt-3 text-xs text-zinc-600 italic">No script available</div>
              )}
            </div>

            {/* Video attached indicator */}
            {(ci.raw_video_url || ci.raw_footage_url) && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2 border border-emerald-400/20">
                <span>&#10003;</span>
                Video attached
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => sprintAction('mark_recorded', currentItem.id)}
                disabled={actionLoading || currentItem.status === 'recorded'}
                className="flex-1 px-4 py-3 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : currentItem.status === 'recorded' ? 'Recorded' : 'Mark Recorded'}
              </button>
              <button
                onClick={() => sprintAction('skip', currentItem.id)}
                disabled={actionLoading || currentItem.status !== 'pending'}
                className="px-4 py-3 text-sm rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                Skip
              </button>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-1">
              <button
                onClick={() => navigateTo(sprint.current_index - 1)}
                disabled={sprint.current_index === 0 || actionLoading}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30"
              >
                &#8592; Previous
              </button>
              <button
                onClick={() => navigateTo(sprint.current_index + 1)}
                disabled={sprint.current_index >= sprint.total_items - 1 || actionLoading}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30"
              >
                Next &#8594;
              </button>
            </div>
          </div>
        </AdminCard>
      )}

      {/* Sprint stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-4 text-center">
          <div className="text-xl font-bold text-emerald-400 tabular-nums">{sprint.completed_items}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Recorded</div>
        </div>
        <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-4 text-center">
          <div className="text-xl font-bold text-zinc-400 tabular-nums">{sprint.skipped_items}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Skipped</div>
        </div>
        <div className="bg-zinc-900/50 rounded-xl border border-white/[0.08] p-4 text-center">
          <div className="text-xl font-bold text-blue-400 tabular-nums">{sprint.total_items - doneCount}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Remaining</div>
        </div>
      </div>
    </AdminPageLayout>
  );
}
