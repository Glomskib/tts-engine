/**
 * MMM Command Center — Making Miles Matter operations dashboard.
 *
 * Server component. Pulls live data from the existing Command Center tables
 * (initiatives, cc_projects, project_tasks, finance_transactions, marketing_posts,
 * agent_runs, ideas) filtered to MMM, and overlays static registry data for the
 * team and event metadata. Built so a second nonprofit org can be dropped in by
 * registering new entries in lib/command-center/mmm/registry.ts.
 */
import { notFound } from 'next/navigation';
import {
  CalendarDays,
  ListTodo,
  Users,
  Megaphone,
  DollarSign,
  FileText,
  Search,
  Bot,
  Target,
  AlertTriangle,
  CheckSquare,
  Handshake,
  Gauge,
} from 'lucide-react';
import CCSubnav from '../_components/CCSubnav';
import { checkIsOwner } from '@/lib/command-center/owner-guard';
import { getMmmDashboardData } from '@/lib/command-center/mmm/queries';
import { Section } from './_components/Section';
import { EventCards } from './_components/EventCards';
import { TasksByOwner } from './_components/TasksByOwner';
import { TeamPanel } from './_components/TeamPanel';
import { SocialQueue } from './_components/SocialQueue';
import { FinancePanel } from './_components/FinancePanel';
import { MeetingNotes } from './_components/MeetingNotes';
import { ResearchQueue } from './_components/ResearchQueue';
import { AgentPanel } from './_components/AgentPanel';
import { NextActions } from './_components/NextActions';
import { OperatorChecklist } from './_components/OperatorChecklist';
import { ApprovalQueue } from './_components/ApprovalQueue';
import { AgentActions } from './_components/AgentActions';
import { SponsorPanel } from './_components/SponsorPanel';
import { ReadinessPanel } from './_components/ReadinessPanel';
import MmmSectionNav from './_components/SectionNav';

export const dynamic = 'force-dynamic';

export default async function MmmCommandCenterPage() {
  const isOwner = await checkIsOwner();
  if (!isOwner) notFound();

  const data = await getMmmDashboardData();

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
      <CCSubnav />

      {/* Header */}
      <header className="space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          Group · {data.group_slug}
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">{data.group_label} Command Center</h1>
        <p className="text-sm text-zinc-400 max-w-3xl">
          Operator dashboard for Making Miles Matter. FFF post-event momentum, HHH planning,
          sponsors, volunteers, social media, finance, meetings, research, and helper-agent
          activity — all in one place. Designed white-label-ready: the same surface can host a
          second nonprofit by adding entries to{' '}
          <code className="text-zinc-300">lib/command-center/mmm/registry.ts</code>.
        </p>
      </header>

      <MmmSectionNav />

      {/* Warnings (e.g., missing seed data) */}
      {data.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3 space-y-1">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4" />
            Setup notes
          </div>
          {data.warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-200/80">
              {w}
            </div>
          ))}
        </div>
      ) : null}

      <Section
        id="next-actions"
        title="Next actions"
        icon={Target}
        count={data.next_actions.length}
        description="Highest-leverage moves right now, hand-picked from the FFF debrief and HHH planning queue."
      >
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <NextActions actions={data.next_actions} />
          </div>
          <div className="lg:col-span-1">
            <OperatorChecklist data={data} />
          </div>
        </div>
      </Section>

      <Section
        id="approvals"
        title="Needs approval"
        icon={CheckSquare}
        count={data.pending_approvals.length}
        description="Anything Bolt/Miles drafted that's waiting on a human call. Approving a social post sends it to the schedule queue. Rejecting requires a reason."
      >
        <ApprovalQueue items={data.pending_approvals} />
      </Section>

      <Section
        id="agent-actions"
        title="Trigger Bolt / Miles"
        icon={Bot}
        description="Real Anthropic-backed actions. Each click drafts something and parks it in Needs Approval — nothing publishes automatically."
      >
        <AgentActions />
      </Section>

      <Section
        id="readiness"
        title="HHH readiness"
        icon={Gauge}
        count={`${data.readiness.ready_pct}%`}
        description="Computed from project_tasks linked to MMM_HHH_2026. Each category's status reflects the most recent open task."
      >
        <ReadinessPanel summary={data.readiness} />
      </Section>

      <Section
        id="sponsors"
        title="Sponsor pipeline"
        icon={Handshake}
        count={data.sponsors.deals.length}
        description="Live read of the mmm-sponsors CRM pipeline. Stage moves and outreach activities feed into the activity column."
      >
        <SponsorPanel data={data.sponsors} />
      </Section>

      <Section
        id="events"
        title="Events"
        icon={CalendarDays}
        count={data.events.length}
        description="FFF wrapped successfully — capture the post-event momentum into HHH outreach. HHH is the next big one."
      >
        <EventCards events={data.events} />
      </Section>

      <Section
        id="tasks"
        title="Tasks by owner"
        icon={ListTodo}
        count={data.task_total}
        description="Live tasks from project_tasks where the project is linked to an MMM initiative. Re-run the seed script to populate."
      >
        <TasksByOwner groups={data.task_groups} total={data.task_total} />
      </Section>

      <Section
        id="team"
        title="Team"
        icon={Users}
        count={data.team.length + data.agents.length}
        description="Brandon (director), Tim (logistics), Josh (helper), plus the Bolt / Miles helper agent."
      >
        <TeamPanel team={data.team} />
      </Section>

      <Section
        id="social"
        title="Social media queue"
        icon={Megaphone}
        count={data.social_posts.length}
        description="Live rows from marketing_posts. Publish the April/May calendar with: npx tsx scripts/marketing/publish-mmm-calendar.ts --file content/social/mmm_apr_may_2026_calendar.md"
      >
        <SocialQueue posts={data.social_posts} />
      </Section>

      <Section
        id="finance"
        title="Financial summary"
        icon={DollarSign}
        count={data.finance.length}
        description="Live finance_transactions joined to MMM initiatives. If empty, the dashboard renders clearly-labeled demo numbers — wipe them once real data lands."
      >
        <FinancePanel summaries={data.finance} />
      </Section>

      <Section
        id="meetings"
        title="Meeting notes"
        icon={FileText}
        count={data.meeting_notes.length}
        description="Markdown files in web/content/meetings/mmm/. Front-matter parses attendees, decisions, and action items."
      >
        <MeetingNotes notes={data.meeting_notes} />
      </Section>

      <Section
        id="research"
        title="Bike-event research"
        icon={Search}
        count={data.research.length}
        description="Queue for studying other bike events — sponsor models, attendance, registration formats. Backed by ideas tagged mmm + bike-event-research."
      >
        <ResearchQueue items={data.research} />
      </Section>

      <Section
        id="agent"
        title="Bolt / Miles workspace"
        icon={Bot}
        count={data.agent_activity.length}
        description="Helper-agent identity + recent suggestions, drafts, and approvals queue. Items marked Demo are placeholders until the real agent loop is wired."
      >
        <AgentPanel agents={data.agents} activity={data.agent_activity} />
      </Section>

      <footer className="pt-4 border-t border-zinc-800/50 text-center text-[11px] text-zinc-600">
        Fetched {new Date(data.fetched_at).toLocaleTimeString()} · group {data.group_slug}
      </footer>
    </div>
  );
}
