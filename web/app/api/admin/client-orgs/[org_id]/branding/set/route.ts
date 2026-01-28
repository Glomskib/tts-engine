import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getClientOrgById } from '@/lib/client-org'
import {
  ORG_BRANDING_EVENT_TYPE,
  sanitizeLogoUrl,
  isValidAccentColor,
  AccentColor,
} from '@/lib/org-branding'
import { getOrgPlan, isPaidOrgPlan } from '@/lib/subscription'
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors'

/**
 * POST /api/admin/client-orgs/[org_id]/branding/set
 * Update branding for a specific organization (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const { org_id: orgId } = await params
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
    const { org_display_name, logo_url, accent_color, welcome_message } = body

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, orgId)
    if (!org) {
      return createApiErrorResponse('NOT_FOUND', 'Organization not found', 404, correlationId)
    }

    // Check org plan for feature gating
    const orgPlanInfo = await getOrgPlan(supabaseAdmin, orgId)
    const isPaidOrg = isPaidOrgPlan(orgPlanInfo.plan)

    // Track warning if premium fields are stripped
    let planWarning: string | null = null
    const strippedFields: string[] = []

    // Build branding object (only include provided fields)
    const branding: {
      org_display_name?: string
      logo_url?: string | null
      accent_color?: AccentColor
      welcome_message?: string | null
    } = {}

    // org_display_name is always allowed
    if (typeof org_display_name === 'string') {
      branding.org_display_name = org_display_name.trim().slice(0, 100) || undefined
    }

    // logo_url: only allowed for paid orgs
    if (logo_url !== undefined) {
      if (isPaidOrg) {
        branding.logo_url = sanitizeLogoUrl(logo_url)
      } else if (logo_url) {
        strippedFields.push('logo_url')
      }
    }

    // accent_color: only allowed for paid orgs
    if (accent_color !== undefined) {
      if (accent_color && !isValidAccentColor(accent_color)) {
        return createApiErrorResponse('VALIDATION_ERROR', 'Invalid accent_color value', 400, correlationId)
      }
      if (isPaidOrg) {
        branding.accent_color = accent_color || undefined
      } else if (accent_color) {
        strippedFields.push('accent_color')
      }
    }

    // welcome_message: only allowed for paid orgs
    if (typeof welcome_message === 'string') {
      if (isPaidOrg) {
        branding.welcome_message = welcome_message.trim().slice(0, 500) || null
      } else if (welcome_message.trim()) {
        strippedFields.push('welcome_message')
      }
    } else if (welcome_message === null && isPaidOrg) {
      branding.welcome_message = null
    }

    // Build warning message if fields were stripped
    if (strippedFields.length > 0) {
      planWarning = `Free plan: ${strippedFields.join(', ')} ignored. Upgrade to Pro for full branding.`
    }

    // Record branding event in events_log
    const { error: insertError } = await supabaseAdmin
      .from('events_log')
      .insert({
        entity_type: 'client_org',
        entity_id: orgId,
        event_type: ORG_BRANDING_EVENT_TYPE,
        payload: {
          updated_by_user_id: user.id,
          branding,
        },
      })

    if (insertError) {
      console.error(`[${correlationId}] Error setting org branding:`, insertError)
      return createApiErrorResponse('DB_ERROR', 'Failed to update branding', 500, correlationId)
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        org_id: orgId,
        branding,
        org_plan: orgPlanInfo.plan,
      },
      ...(planWarning ? { warning: planWarning } : {}),
    })
    response.headers.set('x-correlation-id', correlationId)
    return response
  } catch (error) {
    console.error(`[${correlationId}] Error setting org branding:`, error)
    return createApiErrorResponse('INTERNAL', 'Failed to update branding', 500, correlationId)
  }
}
