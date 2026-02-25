import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import {
  getJobDetail, claimJob, startJob, submitJob,
  approveJob, requestChanges, addFeedback, getMpProfile, getUserClientIds,
} from '@/lib/marketplace/queries';
import type { MpRole } from '@/lib/marketplace/types';

// Actions that require VA or admin role
const VA_ACTIONS = new Set(['claim', 'start', 'submit', 'add_feedback']);
// Actions that require client or admin role
const CLIENT_ACTIONS = new Set(['approve', 'request_changes', 'mark_posted']);

function canPerform(action: string, role: MpRole): boolean {
  if (role === 'admin') return true;
  if (VA_ACTIONS.has(action) && role === 'va_editor') return true;
  if (CLIENT_ACTIONS.has(action) && (role === 'client_owner' || role === 'client_member')) return true;
  // va_editor can also add_feedback (already in VA_ACTIONS)
  // client roles can also add_feedback
  if (action === 'add_feedback' && (role === 'client_owner' || role === 'client_member')) return true;
  return false;
}

/** Strip client name from job response (VAs should only see client_code) */
function sanitizeForVa(job: Record<string, unknown>, role: MpRole) {
  if (role === 'va_editor') {
    // Ensure no client name leaks — only client_code is present
    const { clients, ...rest } = job;
    return rest;
  }
  return job;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getMpProfile(user.id);
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const job = await getJobDetail(id);
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // VAs can see any active job; clients can only see their own
  if (['client_owner', 'client_member'].includes(profile.role)) {
    const clientIds = await getUserClientIds(user.id);
    if (!clientIds.includes(job.client_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  return NextResponse.json({ job: sanitizeForVa(job as unknown as Record<string, unknown>, profile.role as MpRole) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getMpProfile(user.id);
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const action = body.action as string;

  // Role gate
  if (!canPerform(action, profile.role as MpRole)) {
    return NextResponse.json({ error: `Action '${action}' not allowed for role '${profile.role}'` }, { status: 403 });
  }

  try {
    switch (action) {
      case 'claim':
        await claimJob(id, user.id);
        break;
      case 'start':
        await startJob(id, user.id);
        break;
      case 'submit':
        if (!body.deliverable_url) return NextResponse.json({ error: 'deliverable_url required' }, { status: 400 });
        await submitJob(id, user.id, body.deliverable_url, body.label, body.deliverable_type);
        break;
      case 'approve':
        await approveJob(id, user.id);
        break;
      case 'request_changes':
        if (!body.message) return NextResponse.json({ error: 'message required' }, { status: 400 });
        await requestChanges(id, user.id, body.message);
        break;
      case 'add_feedback': {
        const role = profile.role === 'va_editor' ? 'va' : profile.role === 'admin' ? 'admin' : 'client';
        await addFeedback(id, user.id, role, body.message);
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    const job = await getJobDetail(id);
    return NextResponse.json({ job: sanitizeForVa(job as unknown as Record<string, unknown>, profile.role as MpRole) });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
