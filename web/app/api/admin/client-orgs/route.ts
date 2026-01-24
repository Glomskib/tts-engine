import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAllClientOrgs, CLIENT_ORG_EVENT_TYPES } from '@/lib/client-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/admin/client-orgs
 * List all client organizations with stats (admin only)
 */
export async function GET(request: NextRequest) {
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
    const orgs = await getAllClientOrgs(supabaseAdmin)
    return NextResponse.json({ orgs })
  } catch (error) {
    console.error('Error fetching client orgs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/admin/client-orgs
 * Alias for /api/admin/client-orgs/create (admin only)
 */
export async function POST(request: NextRequest) {
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
    const { org_name } = body

    if (!org_name || typeof org_name !== 'string') {
      return NextResponse.json({ error: 'org_name is required' }, { status: 400 })
    }

    // Generate org_id
    const org_id = crypto.randomUUID()

    // Create org via event
    const { error: insertError } = await supabaseAdmin
      .from('video_events')
      .insert({
        video_id: null,
        event_type: CLIENT_ORG_EVENT_TYPES.ORG_CREATED,
        actor_id: user.id,
        details: {
          org_id,
          org_name,
          created_by_user_id: user.id,
        },
      })

    if (insertError) {
      console.error('Error creating client org:', insertError)
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
    }

    return NextResponse.json({ org_id, org_name })
  } catch (error) {
    console.error('Error creating client org:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
