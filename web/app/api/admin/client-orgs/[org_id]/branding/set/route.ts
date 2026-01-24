import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getClientOrgById } from '@/lib/client-org'
import {
  ORG_BRANDING_EVENT_TYPE,
  sanitizeLogoUrl,
  isValidAccentColor,
  AccentColor,
} from '@/lib/org-branding'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/admin/client-orgs/[org_id]/branding/set
 * Update branding for a specific organization (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const { org_id: orgId } = await params

  // Check auth
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { org_display_name, logo_url, accent_color, welcome_message } = body

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, orgId)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Build branding object (only include provided fields)
    const branding: {
      org_display_name?: string
      logo_url?: string | null
      accent_color?: AccentColor
      welcome_message?: string | null
    } = {}

    if (typeof org_display_name === 'string') {
      branding.org_display_name = org_display_name.trim().slice(0, 100) || undefined
    }

    if (logo_url !== undefined) {
      branding.logo_url = sanitizeLogoUrl(logo_url)
    }

    if (accent_color !== undefined) {
      if (accent_color && !isValidAccentColor(accent_color)) {
        return NextResponse.json({ error: 'Invalid accent_color value' }, { status: 400 })
      }
      branding.accent_color = accent_color || undefined
    }

    if (typeof welcome_message === 'string') {
      branding.welcome_message = welcome_message.trim().slice(0, 500) || null
    } else if (welcome_message === null) {
      branding.welcome_message = null
    }

    // Record branding event
    const { error: insertError } = await supabaseAdmin
      .from('video_events')
      .insert({
        video_id: null,
        event_type: ORG_BRANDING_EVENT_TYPE,
        actor_id: user.id,
        details: {
          org_id: orgId,
          updated_by_user_id: user.id,
          branding,
        },
      })

    if (insertError) {
      console.error('Error setting org branding:', insertError)
      return NextResponse.json({ error: 'Failed to update branding' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      data: {
        org_id: orgId,
        branding,
      },
    })
  } catch (error) {
    console.error('Error setting org branding:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
