import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { acceptOrgInvite, getInviteByToken } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

/**
 * POST /api/invite/accept
 * Accept an organization invite (requires auth)
 * Body: { token: string }
 * Returns: { ok, data: { org_id, org_name, role } }
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId()

  const auth = await getApiAuthContext(request)
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId)
  }

  try {
    const body = await request.json()
    const { token } = body

    // Validate token
    if (!token || typeof token !== 'string') {
      return createApiErrorResponse('VALIDATION_ERROR', 'Token is required', 400, correlationId)
    }

    // Validate token format (64 hex chars)
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      return createApiErrorResponse('VALIDATION_ERROR', 'Invalid invite token format', 400, correlationId)
    }

    // Get invite to check it exists and get details
    const invite = await getInviteByToken(supabaseAdmin, token)
    if (!invite) {
      return createApiErrorResponse('NOT_FOUND', 'Invalid or expired invite', 404, correlationId)
    }

    // Accept the invite (emits events for membership)
    const result = await acceptOrgInvite(supabaseAdmin, {
      token,
      user_id: auth.user.id,
    })

    if (!result.success) {
      return createApiErrorResponse('BAD_REQUEST', result.error || 'Failed to accept invite', 400, correlationId)
    }

    // Get org details for response
    const org = await getClientOrgById(supabaseAdmin, invite.org_id)
    const orgName = org?.org_name || 'Organization'

    const response = NextResponse.json({
      ok: true,
      data: {
        org_id: invite.org_id,
        org_name: orgName,
        role: invite.role,
      },
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error accepting invite:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to accept invite', 500, correlationId)
  }
}

/**
 * GET /api/invite/accept?token=xxx
 * Get invite details for display (public - but doesn't expose sensitive data)
 * Returns: { ok, data: { org_name, role, email, expires_at } } or error
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId()
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Token is required', 400, correlationId)
  }

  // Validate token format
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return createApiErrorResponse('VALIDATION_ERROR', 'Invalid invite token format', 400, correlationId)
  }

  try {
    // Get invite details
    const invite = await getInviteByToken(supabaseAdmin, token)
    if (!invite) {
      return createApiErrorResponse('NOT_FOUND', 'Invalid or expired invite', 404, correlationId)
    }

    // Get org name
    const org = await getClientOrgById(supabaseAdmin, invite.org_id)
    const orgName = org?.org_name || 'Organization'

    // Return limited details (no sensitive info)
    const response = NextResponse.json({
      ok: true,
      data: {
        org_name: orgName,
        role: invite.role,
        email: invite.email, // Show which email the invite was sent to
        expires_at: invite.expires_at,
      },
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error fetching invite:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to fetch invite details', 500, correlationId)
  }
}
