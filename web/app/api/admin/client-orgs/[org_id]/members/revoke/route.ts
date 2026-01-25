import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revokeOrgMember, getOrgMembersWithEmail } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/admin/client-orgs/[org_id]/members/revoke
 * Revoke a member's organization membership (admin only)
 * Body: { user_id: string }
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
    const { user_id } = body

    // Validate user_id
    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    if (!uuidRegex.test(user_id)) {
      return NextResponse.json({ error: 'Invalid user_id format' }, { status: 400 })
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Verify user is a member
    const members = await getOrgMembersWithEmail(supabaseAdmin, org_id)
    const isMember = members.some((m) => m.user_id === user_id)
    if (!isMember) {
      return NextResponse.json({ error: 'User is not a member of this organization' }, { status: 404 })
    }

    // Revoke membership
    const result = await revokeOrgMember(supabaseAdmin, {
      user_id,
      org_id,
      actor_user_id: user.id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      data: {
        user_id,
        org_id,
        action: 'revoked',
      },
    })
  } catch (error) {
    console.error('Error revoking member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
