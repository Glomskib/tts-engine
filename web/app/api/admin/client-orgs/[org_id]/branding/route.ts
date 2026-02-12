import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { getClientOrgById } from '@/lib/client-org'
import { getOrgBranding, getRawOrgBranding } from '@/lib/org-branding'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

/**
 * GET /api/admin/client-orgs/[org_id]/branding
 * Get branding for a specific organization (admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const { org_id: orgId } = await params
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

  try {
    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, orgId)
    if (!org) {
      return createApiErrorResponse('NOT_FOUND', 'Organization not found', 404, correlationId)
    }

    // Get effective branding (with defaults applied)
    const effectiveBranding = await getOrgBranding(supabaseAdmin, orgId)

    // Get raw branding (what was explicitly set)
    const rawBranding = await getRawOrgBranding(supabaseAdmin, orgId)

    const response = NextResponse.json({
      ok: true,
      data: {
        org_id: orgId,
        org_name: org.org_name,
        effective: effectiveBranding,
        raw: rawBranding,
      },
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error fetching org branding:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to fetch branding', 500, correlationId)
  }
}
