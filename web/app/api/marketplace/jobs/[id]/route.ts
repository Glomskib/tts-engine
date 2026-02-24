import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { getJobDetail, claimJob, startJob, submitJob, approveJob, requestChanges, addFeedback } from '@/lib/marketplace/queries';
import { getMpProfile } from '@/lib/marketplace/queries';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const job = await getJobDetail(id);
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ job });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  try {
    switch (body.action) {
      case 'claim':
        await claimJob(id, user.id);
        break;
      case 'start':
        await startJob(id, user.id);
        break;
      case 'submit':
        if (!body.deliverable_url) return NextResponse.json({ error: 'deliverable_url required' }, { status: 400 });
        await submitJob(id, user.id, body.deliverable_url, body.label);
        break;
      case 'approve':
        await approveJob(id, user.id);
        break;
      case 'request_changes':
        if (!body.message) return NextResponse.json({ error: 'message required' }, { status: 400 });
        await requestChanges(id, user.id, body.message);
        break;
      case 'add_feedback': {
        const profile = await getMpProfile(user.id);
        const role = profile?.role === 'va_editor' ? 'va' : profile?.role === 'admin' ? 'admin' : 'client';
        await addFeedback(id, user.id, role, body.message);
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    const job = await getJobDetail(id);
    return NextResponse.json({ job });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
