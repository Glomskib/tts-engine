import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createOrgInvite, listPendingOrgInvites, InviteRole } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'
import { sendInviteEmail } from '@/lib/client-email-notifications'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

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
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId()

  // Check auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId)
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid or expired token', 401, correlationId)
  }

  // Check admin role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId)
  }

  // Validate org_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(org_id)) {
    return createApiErrorResponse('INVALID_UUID', 'Invalid org_id format', 400, correlationId)
  }

  try {
    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return createApiErrorResponse('NOT_FOUND', 'Organization not found', 404, correlationId)
    }

    // Get pending invites
    const invites = await listPendingOrgInvites(supabaseAdmin, org_id)

    const response = NextResponse.json({
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
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error fetching org invites:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to fetch invites', 500, correlationId)
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
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId()

  // Check auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId)
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid or expired token', 401, correlationId)
  }

  // Check admin role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId)
  }

  // Validate org_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(org_id)) {
    return createApiErrorResponse('INVALID_UUID', 'Invalid org_id format', 400, correlationId)
  }

  try {
    const body = await request.json()
    const { email, role } = body

    // Validate email
    if (!email || typeof email !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', 'email is required', 400, correlationId)
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return createApiErrorResponse('VALIDATION_ERROR', 'Invalid email format', 400, correlationId)
    }

    // Validate role
    if (!role || !VALID_ROLES.includes(role)) {
      return createApiErrorResponse('VALIDATION_ERROR', `role must be one of: ${VALID_ROLES.join(', ')}`, 400, correlationId)
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return createApiErrorResponse('NOT_FOUND', 'Organization not found', 404, correlationId)
    }

    // Check for existing pending invite with same email
    const existingInvites = await listPendingOrgInvites(supabaseAdmin, org_id)
    const existingInvite = existingInvites.find(
      (inv) => inv.email.toLowerCase() === email.toLowerCase()
    )
    if (existingInvite) {
      return createApiErrorResponse('CONFLICT', 'A pending invite already exists for this email', 409, correlationId, {
        existing_invite_id: existingInvite.invite_id,
      })
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

    const response = NextResponse.json({
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
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error creating invite:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to create invite', 500, correlationId)
  }
}
