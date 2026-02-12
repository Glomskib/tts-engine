import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { revokeOrgMember, getOrgMembersWithEmail } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

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
    const { user_id } = body

    // Validate user_id
    if (!user_id || typeof user_id !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', 'user_id is required', 400, correlationId)
    }

    if (!uuidRegex.test(user_id)) {
      return createApiErrorResponse('INVALID_UUID', 'Invalid user_id format', 400, correlationId)
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return createApiErrorResponse('NOT_FOUND', 'Organization not found', 404, correlationId)
    }

    // Verify user is a member
    const members = await getOrgMembersWithEmail(supabaseAdmin, org_id)
    const isMember = members.some((m) => m.user_id === user_id)
    if (!isMember) {
      return createApiErrorResponse('NOT_FOUND', 'User is not a member of this organization', 404, correlationId)
    }

    // Revoke membership
    const result = await revokeOrgMember(supabaseAdmin, {
      user_id,
      org_id,
      actor_user_id: auth.user.id,
    })

    if (!result.success) {
      return createApiErrorResponse('DB_ERROR', result.error || 'Failed to revoke membership', 500, correlationId)
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        user_id,
        org_id,
        action: 'revoked',
      },
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error revoking member:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to revoke membership', 500, correlationId)
  }
}
