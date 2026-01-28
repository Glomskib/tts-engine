import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { CLIENT_ORG_EVENT_TYPES, getClientOrgById } from '@/lib/client-org'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

/**
 * POST /api/admin/videos/[video_id]/set-client-org
 * Assign a video to a client organization (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ video_id: string }> }
) {
  const { video_id: videoId } = await params
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
    const { org_id } = body

    // Validate required fields
    if (!org_id || typeof org_id !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', 'org_id is required', 400, correlationId)
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return createApiErrorResponse('NOT_FOUND', 'Organization not found', 404, correlationId)
    }

    // Verify video exists
    const { data: video } = await supabaseAdmin
      .from('videos')
      .select('id')
      .eq('id', videoId)
      .single()

    if (!video) {
      return createApiErrorResponse('NOT_FOUND', 'Video not found', 404, correlationId)
    }

    // Record video org assignment event
    const { error: insertError } = await supabaseAdmin
      .from('video_events')
      .insert({
        video_id: videoId,
        event_type: CLIENT_ORG_EVENT_TYPES.VIDEO_ORG_SET,
        actor_id: user.id,
        details: {
          org_id,
          set_by_user_id: user.id,
        },
      })

    if (insertError) {
      console.error(`[${correlationId}] Error setting video org:`, insertError)
      return createApiErrorResponse('DB_ERROR', 'Failed to set video organization', 500, correlationId)
    }

    const response = NextResponse.json({
      success: true,
      video_id: videoId,
      org_id,
      org_name: org.org_name
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error setting video org:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to set video organization', 500, correlationId)
  }
}
