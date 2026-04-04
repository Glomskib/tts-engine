'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { SkeletonAuthCheck } from '@/components/ui/Skeleton';
import { FileText, Mic, Scissors, Send, AlertTriangle, Clock, TrendingUp, Play } from 'lucide-react';
import { ProductionPressurePanel } from '@/components/ProductionPressurePanel';
import { ContentVelocityPanel } from '@/components/ContentVelocityPanel';
import { RenderQueuePanel } from '@/components/RenderQueuePanel';

interface WorkCounts {
  needs_script: number;
  generating_script: number;
  not_recorded: number;
  ai_rendering: number;
  recorded: number;
  ready_for_review: number;
  edited: number;
  approved_needs_edits: number;
  ready_to_post: number;
  posted: number;
  rejected: number;
  overdue: number;
  total: number;
}

interface ThroughputStats {
  created_today: number;
  created_week: number;
  posted_today: number;
  posted_week: number;
}

interface VelocityData {
  scripted_today: number;
  scripted_week: number;
  scripted_last_week: number;
  recorded_today: number;
  recorded_week: number;
  recorded_last_week: number;
  edited_today: number;
  edited_week: number;
  edited_last_week: number;
  posted_today: number;
  posted_week: number;
  posted_last_week: number;
}

export default function ProductionConsolePage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [counts, setCounts] = useState<WorkCounts | null>(null);
  const [throughput, setThroughput] = useState<ThroughputStats | null>(null);
  const [velocity, setVelocity] = useState<VelocityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.push('/login?redirect=/admin/production');
          return;
        }
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();
        setUserRole(roleData.role || null);
      } catch {
        router.push('/login?redirect=/admin/production');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    const fetchData = async () => {
      try {
        const res = await fetch('/api/videos/queue?claimed=any&limit=200');
        const json = await res.json();
        if (json.ok && json.data) {
          const videos: { recording_status: string | null; sla_status: string; created_at: string; last_status_changed_at: string | null }[] = json.data;
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          const c: WorkCounts = {
            needs_script: 0, generating_script: 0, not_recorded: 0, ai_rendering: 0,
            recorded: 0, ready_for_review: 0, edited: 0, approved_needs_edits: 0,
            ready_to_post: 0, posted: 0, rejected: 0, overdue: 0, total: videos.length,
          };

          const tp: ThroughputStats = { created_today: 0, created_week: 0, posted_today: 0, posted_week: 0 };
          const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          const vel: VelocityData = {
            scripted_today: 0, scripted_week: 0, scripted_last_week: 0,
            recorded_today: 0, recorded_week: 0, recorded_last_week: 0,
            edited_today: 0, edited_week: 0, edited_last_week: 0,
            posted_today: 0, posted_week: 0, posted_last_week: 0,
          };

          for (const v of videos) {
            const s = (v.recording_status || '').toLowerCase();
            if (s === 'needs_script') c.needs_script++;
            else if (s === 'generating_script') c.generating_script++;
            else if (s === 'not_recorded') c.not_recorded++;
            else if (s === 'ai_rendering') c.ai_rendering++;
            else if (s === 'recorded') c.recorded++;
            else if (s === 'ready_for_review') c.ready_for_review++;
            else if (s === 'edited') c.edited++;
            else if (s === 'approved_needs_edits') c.approved_needs_edits++;
            else if (s === 'ready_to_post') c.ready_to_post++;
            else if (s === 'posted') c.posted++;
            else if (s === 'rejected') c.rejected++;
            if (v.sla_status === 'overdue') c.overdue++;

            const created = new Date(v.created_at);
            const changed = v.last_status_changed_at ? new Date(v.last_status_changed_at) : created;
            if (created >= todayStart) tp.created_today++;
            if (created >= weekAgo) tp.created_week++;

            // Velocity by stage: count items that reached this stage recently
            // "not_recorded" means script was done, "recorded" means recording done, etc.
            if (s === 'not_recorded' || s === 'recorded' || s === 'edited' || s === 'ready_to_post' || s === 'posted') {
              // Script velocity — items that have moved past scripting
              if (changed >= todayStart) vel.scripted_today++;
              if (changed >= weekAgo) vel.scripted_week++;
              else if (changed >= twoWeeksAgo) vel.scripted_last_week++;
            }
            if (s === 'recorded' || s === 'edited' || s === 'ready_to_post' || s === 'posted') {
              if (changed >= todayStart) vel.recorded_today++;
              if (changed >= weekAgo) vel.recorded_week++;
              else if (changed >= twoWeeksAgo) vel.recorded_last_week++;
            }
            if (s === 'edited' || s === 'ready_to_post' || s === 'posted') {
              if (changed >= todayStart) vel.edited_today++;
              if (changed >= weekAgo) vel.edited_week++;
              else if (changed >= twoWeeksAgo) vel.edited_last_week++;
            }
            if (s === 'posted') {
              if (changed >= todayStart) { tp.posted_today++; vel.posted_today++; }
              if (changed >= weekAgo) { tp.posted_week++; vel.posted_week++; }
              else if (changed >= twoWeeksAgo) vel.posted_last_week++;
            }
          }

          setCounts(c);
          setThroughput(tp);
          setVelocity(vel);
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [authLoading]);

  if (authLoading) return <SkeletonAuthCheck />;

  const goToPipeline = (mode?: string) => {
    router.push(mode ? `/admin/pipeline?mode=${mode}` : '/admin/pipeline');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 lg:pb-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Production Console</h1>
          <p className="text-sm text-zinc-500 mt-1">What needs to happen right now</p>
        </div>

        {loading ? (
          <div className="py-20 text-center text-zinc-500 text-sm">Loading production data...</div>
        ) : counts && throughput ? (
          <div className="space-y-6">
            {/* Next Best Action */}
            {(() => {
              const actions: { label: string; description: string; href: string; urgency: 'high' | 'medium' | 'low' }[] = [];
              if (counts.overdue > 0) {
                actions.push({ label: `Fix ${counts.overdue} overdue item${counts.overdue !== 1 ? 's' : ''}`, description: 'Past SLA deadline', href: '/admin/pipeline', urgency: 'high' });
              }
              if (counts.ready_to_post > 0) {
                actions.push({ label: `Publish ${counts.ready_to_post} video${counts.ready_to_post !== 1 ? 's' : ''}`, description: 'Ready to go live', href: '/admin/pipeline?mode=publish', urgency: 'medium' });
              }
              const editCount = counts.recorded + counts.ready_for_review + counts.edited + counts.approved_needs_edits;
              if (editCount > 5) {
                actions.push({ label: `Edit ${editCount} videos`, description: 'Editing backlog is building', href: '/admin/pipeline?mode=edit', urgency: 'medium' });
              }
              const recordCount = counts.not_recorded + counts.ai_rendering;
              if (recordCount > 0 && editCount < 3) {
                actions.push({ label: `Record ${recordCount} video${recordCount !== 1 ? 's' : ''}`, description: 'Scripts ready, editing queue is clear', href: '/admin/pipeline?mode=record', urgency: 'medium' });
              }
              const scriptCount = counts.needs_script + counts.generating_script;
              if (scriptCount > 0 && recordCount < 3) {
                actions.push({ label: `Script ${scriptCount} video${scriptCount !== 1 ? 's' : ''}`, description: 'Recording queue needs more scripts', href: '/admin/pipeline?mode=scripts', urgency: 'low' });
              }
              if (counts.total === 0 || (scriptCount === 0 && recordCount === 0 && editCount === 0)) {
                actions.push({ label: 'Generate a new campaign', description: 'Pipeline is empty — create content', href: '/admin/campaigns/new', urgency: 'low' });
              }
              const top = actions[0];
              if (!top) return null;
              const urgencyStyles = {
                high: 'bg-red-500/10 border-red-500/20 text-red-400',
                medium: 'bg-teal-500/10 border-teal-500/20 text-teal-400',
                low: 'bg-zinc-800 border-zinc-700 text-zinc-300',
              };
              return (
                <section className="mb-2">
                  <button
                    onClick={() => router.push(top.href)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors hover:brightness-110 ${urgencyStyles[top.urgency]}`}
                  >
                    <div className="text-sm font-semibold">{top.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{top.description}</div>
                  </button>
                </section>
              );
            })()}

            {/* Today's Work */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Today&apos;s Work</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <WorkCard
                  icon={<FileText className="w-5 h-5 text-red-400" />}
                  count={counts.needs_script + counts.generating_script}
                  label={`video${counts.needs_script + counts.generating_script !== 1 ? 's' : ''} need scripts`}
                  sublabel={counts.generating_script > 0 ? `${counts.generating_script} generating` : undefined}
                  onClick={() => goToPipeline('scripts')}
                  color="red"
                />
                <WorkCard
                  icon={<Mic className="w-5 h-5 text-blue-400" />}
                  count={counts.not_recorded + counts.ai_rendering}
                  label={`video${counts.not_recorded + counts.ai_rendering !== 1 ? 's' : ''} ready to record`}
                  sublabel={counts.ai_rendering > 0 ? `${counts.ai_rendering} AI rendering` : undefined}
                  onClick={() => goToPipeline('record')}
                  color="blue"
                />
                <WorkCard
                  icon={<Scissors className="w-5 h-5 text-amber-400" />}
                  count={counts.recorded + counts.ready_for_review + counts.edited + counts.approved_needs_edits}
                  label={`video${(counts.recorded + counts.ready_for_review + counts.edited + counts.approved_needs_edits) !== 1 ? 's' : ''} need editing`}
                  sublabel={counts.ready_for_review > 0 ? `${counts.ready_for_review} ready for review` : undefined}
                  onClick={() => goToPipeline('edit')}
                  color="amber"
                />
                <WorkCard
                  icon={<Send className="w-5 h-5 text-teal-400" />}
                  count={counts.ready_to_post}
                  label={`video${counts.ready_to_post !== 1 ? 's' : ''} ready to publish`}
                  onClick={() => goToPipeline('publish')}
                  color="teal"
                />
              </div>
            </section>

            {/* Overdue / Blocked */}
            {counts.overdue > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Attention Needed</h2>
                <button
                  onClick={() => router.push('/admin/pipeline')}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/15 transition-colors text-left"
                >
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-red-400">
                      {counts.overdue} overdue item{counts.overdue !== 1 ? 's' : ''}
                    </span>
                    <p className="text-xs text-zinc-500 mt-0.5">Past their SLA deadline — needs immediate action</p>
                  </div>
                </button>
              </section>
            )}

            {/* Quick Start Sessions */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Quick Start</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <QuickStartButton
                  label="Script Session"
                  count={counts.needs_script}
                  onClick={() => goToPipeline('scripts')}
                  icon={<FileText className="w-4 h-4" />}
                  color="text-red-400"
                />
                <QuickStartButton
                  label="Record Session"
                  count={counts.not_recorded}
                  onClick={() => goToPipeline('record')}
                  icon={<Mic className="w-4 h-4" />}
                  color="text-blue-400"
                />
                <QuickStartButton
                  label="Edit Session"
                  count={counts.recorded + counts.edited + counts.approved_needs_edits}
                  onClick={() => goToPipeline('edit')}
                  icon={<Scissors className="w-4 h-4" />}
                  color="text-amber-400"
                />
                <QuickStartButton
                  label="Publish Session"
                  count={counts.ready_to_post}
                  onClick={() => goToPipeline('publish')}
                  icon={<Send className="w-4 h-4" />}
                  color="text-teal-400"
                />
              </div>
            </section>

            {/* Production Pressure */}
            <section>
              <ProductionPressurePanel
                scriptsNeeded={counts.needs_script + counts.generating_script}
                readyToRecord={counts.not_recorded + counts.ai_rendering}
                editing={counts.recorded + counts.ready_for_review + counts.edited + counts.approved_needs_edits}
                readyToPublish={counts.ready_to_post}
                overdue={counts.overdue}
              />
            </section>

            {/* Content Velocity */}
            {velocity && (
              <section>
                <ContentVelocityPanel
                  metrics={[
                    { label: 'Scripted', today: velocity.scripted_today, thisWeek: velocity.scripted_week, lastWeek: velocity.scripted_last_week, color: 'text-red-400' },
                    { label: 'Recorded', today: velocity.recorded_today, thisWeek: velocity.recorded_week, lastWeek: velocity.recorded_last_week, color: 'text-blue-400' },
                    { label: 'Edited', today: velocity.edited_today, thisWeek: velocity.edited_week, lastWeek: velocity.edited_last_week, color: 'text-amber-400' },
                    { label: 'Posted', today: velocity.posted_today, thisWeek: velocity.posted_week, lastWeek: velocity.posted_last_week, color: 'text-green-400' },
                  ]}
                />
              </section>
            )}

            {/* Render Queue */}
            <section>
              <RenderQueuePanel />
            </section>

            {/* Throughput Snapshot */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Throughput</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ThroughputCard label="Created today" value={throughput.created_today} icon={<Clock className="w-3.5 h-3.5 text-zinc-500" />} />
                <ThroughputCard label="Created this week" value={throughput.created_week} icon={<TrendingUp className="w-3.5 h-3.5 text-zinc-500" />} />
                <ThroughputCard label="Posted today" value={throughput.posted_today} icon={<Play className="w-3.5 h-3.5 text-green-500" />} />
                <ThroughputCard label="Posted this week" value={throughput.posted_week} icon={<TrendingUp className="w-3.5 h-3.5 text-green-500" />} />
              </div>
            </section>

            {/* Pipeline at a Glance */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Pipeline</h2>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden bg-zinc-800">
                  <PipelineBar count={counts.needs_script + counts.generating_script} total={counts.total} color="bg-red-500" />
                  <PipelineBar count={counts.not_recorded + counts.ai_rendering} total={counts.total} color="bg-blue-500" />
                  <PipelineBar count={counts.recorded + counts.ready_for_review + counts.edited + counts.approved_needs_edits} total={counts.total} color="bg-amber-500" />
                  <PipelineBar count={counts.ready_to_post} total={counts.total} color="bg-teal-500" />
                  <PipelineBar count={counts.posted} total={counts.total} color="bg-green-500" />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-zinc-500">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Scripts ({counts.needs_script + counts.generating_script})</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />Record ({counts.not_recorded + counts.ai_rendering})</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />Edit ({counts.recorded + counts.ready_for_review + counts.edited + counts.approved_needs_edits})</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-teal-500 mr-1" />Publish ({counts.ready_to_post})</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Posted ({counts.posted})</span>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="py-20 text-center text-zinc-500 text-sm">No production data available</div>
        )}
      </div>
    </div>
  );
}

function WorkCard({ icon, count, label, sublabel, onClick, color }: {
  icon: React.ReactNode;
  count: number;
  label: string;
  sublabel?: string;
  onClick: () => void;
  color: string;
}) {
  const bgMap: Record<string, string> = {
    red: 'bg-red-500/5 border-red-500/15 hover:bg-red-500/10',
    blue: 'bg-blue-500/5 border-blue-500/15 hover:bg-blue-500/10',
    amber: 'bg-amber-500/5 border-amber-500/15 hover:bg-amber-500/10',
    teal: 'bg-teal-500/5 border-teal-500/15 hover:bg-teal-500/10',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${bgMap[color] || bgMap.blue}`}
    >
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-white tabular-nums">{count}</div>
        <div className="text-sm text-zinc-400">{label}</div>
        {sublabel && <div className="text-xs text-zinc-500 mt-0.5">{sublabel}</div>}
      </div>
    </button>
  );
}

function QuickStartButton({ label, count, onClick, icon, color }: {
  label: string;
  count: number;
  onClick: () => void;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 transition-colors text-center"
    >
      <div className={color}>{icon}</div>
      <span className="text-xs font-medium text-zinc-300">{label}</span>
      {count > 0 && (
        <span className="text-[10px] text-zinc-500 tabular-nums">{count} ready</span>
      )}
    </button>
  );
}

function ThroughputCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[11px] text-zinc-500">{label}</span></div>
      <div className="text-lg font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}

function PipelineBar({ count, total, color }: { count: number; total: number; color: string }) {
  if (count === 0 || total === 0) return null;
  const pct = Math.max((count / total) * 100, 2);
  return <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }} />;
}
