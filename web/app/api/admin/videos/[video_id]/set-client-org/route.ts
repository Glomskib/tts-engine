import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { CLIENT_ORG_EVENT_TYPES, getClientOrgById } from '@/lib/client-org'

/**
 * POST /api/admin/videos/[video_id]/set-client-org
 * Assign a video to a client organization (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ video_id: string }> }
) {
  const { video_id: videoId } = await params

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
    const { org_id } = body

    // Validate required fields
    if (!org_id || typeof org_id !== 'string') {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
    }

    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Verify video exists
    const { data: video } = await supabaseAdmin
      .from('videos')
      .select('id')
      .eq('id', videoId)
      .single()

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
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
      console.error('Error setting video org:', insertError)
      return NextResponse.json({ error: 'Failed to set video organization' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      video_id: videoId,
      org_id,
      org_name: org.org_name
    })
  } catch (error) {
    console.error('Error setting video org:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
