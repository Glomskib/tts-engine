import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { CLIENT_ORG_EVENT_TYPES, getClientOrgById } from '@/lib/client-org'

/**
 * POST /api/admin/client-orgs/members/set
 * Add or remove a member from an organization (admin only)
 */
export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json()
    const { org_id, user_id, role, action } = body

    // Validate required fields
    if (!org_id || typeof org_id !== 'string') {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
    }
    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }
    if (!['owner', 'member'].includes(role)) {
      return NextResponse.json({ error: 'role must be "owner" or "member"' }, { status: 400 })
    }
    if (!['add', 'remove'].includes(action)) {
      return NextResponse.json({ error: 'action must be "add" or "remove"' }, { status: 400 })
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Verify user exists
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user_id)
      .single()

    if (!targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Record membership event in events_log
    const { error: insertError } = await supabaseAdmin
      .from('events_log')
      .insert({
        entity_type: 'client_org',
        entity_id: org_id,
        event_type: CLIENT_ORG_EVENT_TYPES.MEMBER_SET,
        payload: {
          user_id,
          role,
          action,
          set_by_user_id: user.id,
        },
      })

    if (insertError) {
      console.error('Error setting org membership:', insertError)
      return NextResponse.json({ error: 'Failed to set membership' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      org_id,
      user_id,
      role,
      action
    })
  } catch (error) {
    console.error('Error setting org membership:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
