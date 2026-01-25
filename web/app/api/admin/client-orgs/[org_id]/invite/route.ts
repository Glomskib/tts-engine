import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createOrgInvite, listPendingOrgInvites, InviteRole } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'
import { sendInviteEmail } from '@/lib/client-email-notifications'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_ROLES: InviteRole[] = ['client', 'recorder', 'editor', 'uploader', 'admin']

/**
 * GET /api/admin/client-orgs/[org_id]/invite
 * List pending invites for an organization (admin only)
 */
export async function GET(
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
    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get pending invites
    const invites = await listPendingOrgInvites(supabaseAdmin, org_id)

    return NextResponse.json({
      ok: true,
      data: {
        org_id,
        invites: invites.map((inv) => ({
          invite_id: inv.invite_id,
          email: inv.email,
          role: inv.role,
          expires_at: inv.expires_at,
          created_at: inv.created_at,
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching org invites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/admin/client-orgs/[org_id]/invite
 * Create a new invite for an organization (admin only)
 * Body: { email: string, role: InviteRole }
 * Returns: { invite_id, token, invite_url, expires_at }
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
    const { email, role } = body

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Validate role
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({
        error: `role must be one of: ${VALID_ROLES.join(', ')}`,
      }, { status: 400 })
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Check for existing pending invite with same email
    const existingInvites = await listPendingOrgInvites(supabaseAdmin, org_id)
    const existingInvite = existingInvites.find(
      (inv) => inv.email.toLowerCase() === email.toLowerCase()
    )
    if (existingInvite) {
      return NextResponse.json({
        error: 'A pending invite already exists for this email',
        existing_invite_id: existingInvite.invite_id,
      }, { status: 409 })
    }

    // Create invite
    const result = await createOrgInvite(supabaseAdmin, {
      org_id,
      email,
      role,
      actor_user_id: user.id,
    })

    // Build invite URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || ''
    const inviteUrl = `${baseUrl}/invite/${result.token}`

    // Send invite email (fail-safe: never blocks invite creation)
    const emailResult = await sendInviteEmail({
      recipientEmail: email,
      orgName: org.org_name,
      role,
      inviteUrl,
      invitedByEmail: user.email || undefined,
    })

    return NextResponse.json({
      ok: true,
      data: {
        invite_id: result.invite_id,
        token: result.token,
        invite_url: inviteUrl,
        expires_at: result.expires_at,
        email,
        role,
        email_sent: emailResult.sent,
        email_skipped: emailResult.skipped,
        email_status: emailResult.status,
      },
    })
  } catch (error) {
    console.error('Error creating invite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
