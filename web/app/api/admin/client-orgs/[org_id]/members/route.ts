import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOrgMembersWithEmail } from '@/lib/org-invites'
import { getClientOrgById } from '@/lib/client-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/admin/client-orgs/[org_id]/members
 * List all members of an organization with email addresses (admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const { org_id } = await params

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

  // Validate org_id format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(org_id)) {
    return NextResponse.json({ error: 'Invalid org_id format' }, { status: 400 })
  }

  try {
    // Verify org exists
    const org = await getClientOrgById(supabaseAdmin, org_id)
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
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

    return NextResponse.json({
      ok: true,
      data: {
        org_id,
        members: membersWithEmails,
      },
    })
  } catch (error) {
    console.error('Error fetching org members:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
