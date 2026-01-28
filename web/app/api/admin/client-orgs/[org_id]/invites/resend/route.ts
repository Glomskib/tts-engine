import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resendOrgInvite, listPendingOrgInvites } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'
import { sendInviteResendEmail } from '@/lib/client-email-notifications'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

/**
 * POST /api/admin/client-orgs/[org_id]/invites/resend
 * Resend a pending invite with new token (admin only)
 * Body: { invite_id: string }
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
    const { invite_id } = body

    // Validate invite_id
    if (!invite_id || typeof invite_id !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', 'invite_id is required', 400, correlationId)
    }

    if (!uuidRegex.test(invite_id)) {
      return createApiErrorResponse('INVALID_UUID', 'Invalid invite_id format', 400, correlationId)
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return createApiErrorResponse('NOT_FOUND', 'Organization not found', 404, correlationId)
    }

    // Verify invite exists and is pending
    const pendingInvites = await listPendingOrgInvites(supabaseAdmin, org_id)
    const invite = pendingInvites.find((inv) => inv.invite_id === invite_id)
    if (!invite) {
      return createApiErrorResponse('NOT_FOUND', 'Invite not found or already revoked/accepted', 404, correlationId)
    }

    // Resend invite
    const result = await resendOrgInvite(supabaseAdmin, {
      invite_id,
      org_id,
      actor_user_id: user.id,
    })

    if (!result.success) {
      return createApiErrorResponse('DB_ERROR', result.error || 'Failed to resend invite', 500, correlationId)
    }

    // Build invite URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || ''
    const inviteUrl = `${baseUrl}/invite/${result.token}`

    // Send resend invite email (fail-safe)
    const emailResult = await sendInviteResendEmail({
      recipientEmail: invite.email,
      orgName: org.org_name,
      role: invite.role,
      inviteUrl,
      invitedByEmail: user.email || undefined,
    })

    const response = NextResponse.json({
      ok: true,
      data: {
        invite_id,
        token: result.token,
        invite_url: inviteUrl,
        expires_at: result.expires_at,
        email: invite.email,
        role: invite.role,
        email_sent: emailResult.sent,
        email_skipped: emailResult.skipped,
        email_status: emailResult.status,
      },
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error resending invite:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to resend invite', 500, correlationId)
  }
}
