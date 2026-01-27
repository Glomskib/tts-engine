import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { revokeOrgInvite, listPendingOrgInvites } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'

/**
 * POST /api/admin/client-orgs/[org_id]/invites/revoke
 * Revoke a pending invite (admin only)
 * Body: { invite_id: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const { org_id } = await params

  // Check auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate org_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(org_id)) {
    return NextResponse.json({ error: 'Invalid org_id format' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { invite_id } = body

    // Validate invite_id
    if (!invite_id || typeof invite_id !== 'string') {
      return NextResponse.json({ error: 'invite_id is required' }, { status: 400 })
    }

    if (!uuidRegex.test(invite_id)) {
      return NextResponse.json({ error: 'Invalid invite_id format' }, { status: 400 })
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Verify invite exists and is pending
    const pendingInvites = await listPendingOrgInvites(supabaseAdmin, org_id)
    const invite = pendingInvites.find((inv) => inv.invite_id === invite_id)
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found or already revoked' }, { status: 404 })
    }

    // Revoke invite
    const result = await revokeOrgInvite(supabaseAdmin, {
      invite_id,
      org_id,
      actor_user_id: user.id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      data: {
        invite_id,
        org_id,
        action: 'revoked',
      },
    })
  } catch (error) {
    console.error('Error revoking invite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
