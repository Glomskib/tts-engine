import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { CLIENT_ORG_EVENT_TYPES } from '@/lib/client-org'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

/**
 * POST /api/admin/client-orgs/create
 * Create a new client organization (admin only)
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
    const { org_name } = body

    if (!org_name || typeof org_name !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', 'org_name is required', 400, correlationId)
    }

    // Generate org_id
    const org_id = crypto.randomUUID()

    // Create org via event in events_log
    const { error: insertError } = await supabaseAdmin
      .from('events_log')
      .insert({
        entity_type: 'client_org',
        entity_id: org_id,
        event_type: CLIENT_ORG_EVENT_TYPES.ORG_CREATED,
        payload: {
          org_name,
          created_by_user_id: user.id,
        },
      })

    if (insertError) {
      console.error(`[${correlationId}] Error creating client org:`, insertError)
      return createApiErrorResponse('DB_ERROR', 'Failed to create organization', 500, correlationId)
    }

    const response = NextResponse.json({ org_id, org_name })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error creating client org:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to create organization', 500, correlationId)
  }
}
