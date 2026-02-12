import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { revokeOrgInvite, listPendingOrgInvites } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

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
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId()

  const auth = await getApiAuthContext(request)
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId)
  }

  // Check admin role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
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
      return createApiErrorResponse('NOT_FOUND', 'Invite not found or already revoked', 404, correlationId)
    }

    // Revoke invite
    const result = await revokeOrgInvite(supabaseAdmin, {
      invite_id,
      org_id,
      actor_user_id: auth.user.id,
    })

    if (!result.success) {
      return createApiErrorResponse('DB_ERROR', result.error || 'Failed to revoke invite', 500, correlationId)
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        invite_id,
        org_id,
        action: 'revoked',
      },
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error revoking invite:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to revoke invite', 500, correlationId)
  }
}
