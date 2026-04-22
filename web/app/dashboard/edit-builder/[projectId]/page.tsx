/**
 * Edit Builder — project detail page.
 *
 * Server component: loads project + clips + latest plan + recent renders,
 * then hands everything to `EditBuilderClient` for interactive behavior
 * (upload, generate plan, render, video player, status polling).
 */
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import type {
  EditProjectRow,
  EditSourceClipRow,
  EditPlanRow,
  RenderJobRow,
} from '@/lib/edit-builder/types';
import EditBuilderClient from './components/EditBuilderClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function EditBuilderProjectPage({ params }: Props) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: project } = await supabase
    .from('edit_projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single<EditProjectRow>();
  if (!project) notFound();

  const [clipsRes, planRes, rendersRes] = await Promise.all([
    supabase
      .from('edit_source_clips')
      .select('*')
      .eq('edit_project_id', projectId)
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('edit_plans')
      .select('*')
      .eq('edit_project_id', projectId)
      .eq('user_id', user.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('render_jobs')
      .select('*')
      .eq('edit_project_id', projectId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const clips = (clipsRes.data ?? []) as EditSourceClipRow[];
  const plan = (planRes.data ?? null) as EditPlanRow | null;
  const renders = (rendersRes.data ?? []) as RenderJobRow[];

  return (
    <main style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <a href="/dashboard/edit-builder" style={{ fontSize: 12, color: '#888' }}>
          ← All projects
        </a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4 }}>
          {project.title}
        </h1>
        <div style={{ fontSize: 12, color: '#888' }}>
          status: {project.status} · {project.aspect_ratio} · {project.target_platform}
        </div>
      </header>

      <EditBuilderClient
        projectId={projectId}
        clips={clips}
        plan={plan}
        renders={renders}
      />
    </main>
  );
}
