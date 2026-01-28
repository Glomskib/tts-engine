import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { CLIENT_ORG_EVENT_TYPES, getClientOrgById } from '@/lib/client-org'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

/**
 * POST /api/admin/client-orgs/members/set
 * Add or remove a member from an organization (admin only)
 */
export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json()
    const { org_id, user_id, role, action } = body

    // Validate required fields
    if (!org_id || typeof org_id !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', 'org_id is required', 400, correlationId)
    }
    if (!user_id || typeof user_id !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', 'user_id is required', 400, correlationId)
    }
    if (!['owner', 'member'].includes(role)) {
      return createApiErrorResponse('VALIDATION_ERROR', 'role must be "owner" or "member"', 400, correlationId)
    }
    if (!['add', 'remove'].includes(action)) {
      return createApiErrorResponse('VALIDATION_ERROR', 'action must be "add" or "remove"', 400, correlationId)
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return createApiErrorResponse('NOT_FOUND', 'Organization not found', 404, correlationId)
    }

    // Verify user exists
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user_id)
      .single()

    if (!targetProfile) {
      return createApiErrorResponse('NOT_FOUND', 'User not found', 404, correlationId)
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
      console.error(`[${correlationId}] Error setting org membership:`, insertError)
      return createApiErrorResponse('DB_ERROR', 'Failed to set membership', 500, correlationId)
    }

    const response = NextResponse.json({
      success: true,
      org_id,
      user_id,
      role,
      action
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error setting org membership:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to set membership', 500, correlationId)
  }
}
