/**
 * POST /api/client/onboard
 *
 * Stores onboarding answers and seeds initial tasks for a new ops customer.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const STARTER_TASKS: Record<string, { title: string; description: string }[]> = {
  content: [
    { title: 'Set up content calendar', description: 'Define posting schedule and content pillars.' },
    { title: 'Create first content batch', description: 'Generate 5 scripts for your first week.' },
    { title: 'Connect social accounts', description: 'Link TikTok, Instagram, or YouTube.' },
    { title: 'Review content performance', description: 'Check which posts are getting traction.' },
    { title: 'Plan next week content', description: 'Schedule content for the upcoming week.' },
  ],
  leads: [
    { title: 'Define ideal customer profile', description: 'Who are you trying to reach?' },
    { title: 'Set up outreach templates', description: 'Create email/DM templates for outreach.' },
    { title: 'Build prospect list', description: 'Find 20 potential customers or partners.' },
    { title: 'Send first outreach batch', description: 'Send personalized messages to prospects.' },
    { title: 'Follow up on responses', description: 'Track and respond to replies.' },
  ],
  sales: [
    { title: 'Audit current inventory', description: 'Check stock levels across all channels.' },
    { title: 'Set up order tracking', description: 'Configure order status monitoring.' },
    { title: 'Review pricing strategy', description: 'Compare your prices to competitors.' },
    { title: 'Optimize top listings', description: 'Improve your best-selling product pages.' },
    { title: 'Set up restock alerts', description: 'Get notified before items run out.' },
  ],
  operations: [
    { title: 'Map current workflows', description: 'Document what happens daily in your business.' },
    { title: 'Identify bottlenecks', description: 'Find where things get stuck or slow down.' },
    { title: 'Set up monitoring', description: 'Configure alerts for critical processes.' },
    { title: 'Create daily checklist', description: 'Define the must-do items for each day.' },
    { title: 'Review and optimize', description: 'Check what worked and what needs fixing.' },
  ],
};

export async function POST(req: Request) {
  const auth = await getApiAuthContext(req);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json();
  const { name, goal, stage } = body as { name: string; goal: string; stage: string };

  if (!name || !goal || !stage) {
    return NextResponse.json({ error: 'name, goal, and stage are required' }, { status: 400 });
  }

  // Create a project for this customer
  const laneName = goal.charAt(0).toUpperCase() + goal.slice(1);
  const { data: project, error: projErr } = await supabaseAdmin
    .from('cc_projects')
    .insert({
      name: `${name} — ${laneName}`,
      type: 'other',
      status: 'active',
      owner: auth.user.email,
    })
    .select('id')
    .single();

  if (projErr) {
    console.error('[api/client/onboard] project insert error:', projErr);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }

  // Seed starter tasks
  const tasks = (STARTER_TASKS[goal] || STARTER_TASKS.operations).map((t, i) => ({
    project_id: project.id,
    title: t.title,
    description: t.description,
    assigned_agent: 'system',
    status: i === 0 ? 'active' : 'queued',
    priority: i + 1,
    risk_tier: 'low',
    lane: laneName,
    source_system: 'onboarding',
  }));

  const { error: taskErr } = await supabaseAdmin.from('project_tasks').insert(tasks);
  if (taskErr) {
    console.error('[api/client/onboard] task insert error:', taskErr);
  }

  return NextResponse.json({ ok: true, project_id: project.id });
}
