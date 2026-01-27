import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { acceptOrgInvite, getInviteByToken } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'

/**
 * POST /api/invite/accept
 * Accept an organization invite (requires auth)
 * Body: { token: string }
 * Returns: { ok, data: { org_id, org_name, role } }
 */
export async function POST(request: NextRequest) {
  // Check auth - derive actor from session
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(userToken)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { token } = body

    // Validate token
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Validate token format (64 hex chars)
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      return NextResponse.json({ error: 'Invalid invite' }, { status: 400 })
    }

    // Get invite to check it exists and get details
    const invite = await getInviteByToken(supabaseAdmin, token)
    if (!invite) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
    }

    // Accept the invite (emits events for membership)
    const result = await acceptOrgInvite(supabaseAdmin, {
      token,
      user_id: user.id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to accept invite' }, { status: 400 })
    }

    // Get org details for response
    const org = await getClientOrgById(supabaseAdmin, invite.org_id)
    const orgName = org?.org_name || 'Organization'

    return NextResponse.json({
      ok: true,
      data: {
        org_id: invite.org_id,
        org_name: orgName,
        role: invite.role,
      },
    })
  } catch (error) {
    console.error('Error accepting invite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/invite/accept?token=xxx
 * Get invite details for display (public - but doesn't expose sensitive data)
 * Returns: { ok, data: { org_name, role, email, expires_at } } or error
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  // Validate token format
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 400 })
  }

  try {
    // Get invite details
    const invite = await getInviteByToken(supabaseAdmin, token)
    if (!invite) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
    }

    // Get org name
    const org = await getClientOrgById(supabaseAdmin, invite.org_id)
    const orgName = org?.org_name || 'Organization'

    // Return limited details (no sensitive info)
    return NextResponse.json({
      ok: true,
      data: {
        org_name: orgName,
        role: invite.role,
        email: invite.email, // Show which email the invite was sent to
        expires_at: invite.expires_at,
      },
    })
  } catch (error) {
    console.error('Error fetching invite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
