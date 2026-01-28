import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrgMembersWithEmail } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

/**
 * GET /api/admin/client-orgs/[org_id]/members
 * List all members of an organization with email addresses (admin only)
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

    // Get members
    const members = await getOrgMembersWithEmail(supabaseAdmin, org_id)

    // Resolve email addresses from auth.users
    const membersWithEmails = await Promise.all(
      members.map(async (member) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(member.user_id)
        return {
          ...member,
          email: userData?.user?.email || null,
        }
      })
    )

    const response = NextResponse.json({
      ok: true,
      data: {
        org_id,
        members: membersWithEmails,
      },
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error fetching org members:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to fetch members', 500, correlationId)
  }
}
