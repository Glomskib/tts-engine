import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getClientOrgById } from '@/lib/client-org'
import { getOrgBranding, getRawOrgBranding } from '@/lib/org-branding'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/admin/client-orgs/[org_id]/branding
 * Get branding for a specific organization (admin only)
 */
export async function GET(
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
    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, orgId)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get effective branding (with defaults applied)
    const effectiveBranding = await getOrgBranding(supabaseAdmin, orgId)

    // Get raw branding (what was explicitly set)
    const rawBranding = await getRawOrgBranding(supabaseAdmin, orgId)

    return NextResponse.json({
      ok: true,
      data: {
        org_id: orgId,
        org_name: org.org_name,
        effective: effectiveBranding,
        raw: rawBranding,
      },
    })
  } catch (error) {
    console.error('Error fetching org branding:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
