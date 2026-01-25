/**
 * Client Organization Resolver
 *
 * Event-based organization membership and video scoping.
 * Uses events_log table for org-level events and video_events for video-scoped events.
 *
 * Event types in events_log (entity_type='client_org', entity_id=org_id):
 * - client_org_created: { org_name, created_by_user_id }
 * - client_org_member_set: { user_id, role, action }
 *
 * Event types in video_events (requires valid video_id):
 * - video_client_org_set: { org_id, set_by_user_id }
 */

import { SupabaseClient } from '@supabase/supabase-js'

// Types
export interface ClientOrg {
  org_id: string
  org_name: string
  created_at: string
  created_by_user_id: string
}

export interface OrgMembership {
  org_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
}

export interface OrgWithStats extends ClientOrg {
  member_count: number
  video_count: number
  last_activity_at: string | null
}

// Event type constants
export const CLIENT_ORG_EVENT_TYPES = {
  ORG_CREATED: 'client_org_created',
  MEMBER_SET: 'client_org_member_set',
  VIDEO_ORG_SET: 'video_client_org_set',
} as const

/**
 * Get all organizations (admin use)
 */
export async function getAllClientOrgs(
  supabase: SupabaseClient
): Promise<OrgWithStats[]> {
  // Get all org creation events from events_log
  const { data: orgEvents, error: orgError } = await supabase
    .from('events_log')
    .select('entity_id, payload, created_at')
    .eq('entity_type', 'client_org')
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.ORG_CREATED)
    .order('created_at', { ascending: false })

  if (orgError || !orgEvents) {
    console.error('Error fetching client orgs:', orgError)
    return []
  }

  const orgs: ClientOrg[] = orgEvents.map((e) => ({
    org_id: e.entity_id,
    org_name: (e.payload as Record<string, unknown>)?.org_name as string || 'Unnamed',
    created_at: e.created_at,
    created_by_user_id: (e.payload as Record<string, unknown>)?.created_by_user_id as string,
  }))

  // Get member counts and video counts for each org
  const orgsWithStats: OrgWithStats[] = []

  for (const org of orgs) {
    const memberCount = await getOrgMemberCount(supabase, org.org_id)
    const videoCount = await getOrgVideoCount(supabase, org.org_id)
    const lastActivity = await getOrgLastActivity(supabase, org.org_id)

    orgsWithStats.push({
      ...org,
      member_count: memberCount,
      video_count: videoCount,
      last_activity_at: lastActivity,
    })
  }

  return orgsWithStats
}

/**
 * Get organization details by ID
 */
export async function getClientOrgById(
  supabase: SupabaseClient,
  orgId: string
): Promise<ClientOrg | null> {
  const { data: orgEvent, error } = await supabase
    .from('events_log')
    .select('entity_id, payload, created_at')
    .eq('entity_type', 'client_org')
    .eq('entity_id', orgId)
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.ORG_CREATED)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !orgEvent) {
    return null
  }

  const payload = orgEvent.payload as Record<string, unknown>
  return {
    org_id: orgEvent.entity_id,
    org_name: (payload?.org_name as string) || 'Unnamed',
    created_at: orgEvent.created_at,
    created_by_user_id: payload?.created_by_user_id as string,
  }
}

/**
 * Get organizations where user is a current member
 */
export async function getUserClientOrgs(
  supabase: SupabaseClient,
  userId: string
): Promise<OrgMembership[]> {
  // Get all membership events from events_log
  const { data: memberEvents, error } = await supabase
    .from('events_log')
    .select('entity_id, payload, created_at')
    .eq('entity_type', 'client_org')
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.MEMBER_SET)
    .order('created_at', { ascending: true })

  if (error || !memberEvents) {
    console.error('Error fetching user org memberships:', error)
    return []
  }

  // Filter to events for this user and compute current membership state
  const membershipByOrg = new Map<string, OrgMembership | null>()

  for (const event of memberEvents) {
    const payload = event.payload as Record<string, unknown>
    if (payload?.user_id !== userId) continue

    const orgId = event.entity_id
    const action = payload?.action as string

    if (action === 'add') {
      membershipByOrg.set(orgId, {
        org_id: orgId,
        user_id: userId,
        role: (payload?.role as 'owner' | 'member') || 'member',
        joined_at: event.created_at,
      })
    } else if (action === 'remove') {
      membershipByOrg.set(orgId, null)
    }
  }

  // Return only active memberships
  const activeMemberships: OrgMembership[] = []
  for (const membership of membershipByOrg.values()) {
    if (membership) {
      activeMemberships.push(membership)
    }
  }

  return activeMemberships
}

/**
 * Get user's primary organization (newest membership or first if multiple)
 */
export async function getPrimaryClientOrgForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<OrgMembership | null> {
  const memberships = await getUserClientOrgs(supabase, userId)
  if (memberships.length === 0) {
    return null
  }

  // Sort by joined_at descending and return newest
  memberships.sort((a, b) =>
    new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
  )

  return memberships[0]
}

/**
 * Get the organization ID assigned to a video
 */
export async function getVideoOrgId(
  supabase: SupabaseClient,
  videoId: string
): Promise<string | null> {
  // Get most recent video_client_org_set event for this video
  const { data: orgEvents, error } = await supabase
    .from('video_events')
    .select('details')
    .eq('video_id', videoId)
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.VIDEO_ORG_SET)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !orgEvents || orgEvents.length === 0) {
    return null
  }

  return orgEvents[0].details?.org_id || null
}

/**
 * Check if user is a member of a specific organization
 */
export async function isUserMemberOfOrg(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<boolean> {
  const memberships = await getUserClientOrgs(supabase, userId)
  return memberships.some((m) => m.org_id === orgId)
}

/**
 * Get all current members of an organization
 */
export async function getOrgMembers(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgMembership[]> {
  // Get all membership events for this org from events_log
  const { data: memberEvents, error } = await supabase
    .from('events_log')
    .select('payload, created_at')
    .eq('entity_type', 'client_org')
    .eq('entity_id', orgId)
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.MEMBER_SET)
    .order('created_at', { ascending: true })

  if (error || !memberEvents) {
    return []
  }

  // Compute current membership state per user
  const membershipByUser = new Map<string, OrgMembership | null>()

  for (const event of memberEvents) {
    const payload = event.payload as Record<string, unknown>
    const userId = payload?.user_id as string
    const action = payload?.action as string

    if (action === 'add') {
      membershipByUser.set(userId, {
        org_id: orgId,
        user_id: userId,
        role: (payload?.role as 'owner' | 'member') || 'member',
        joined_at: event.created_at,
      })
    } else if (action === 'remove') {
      membershipByUser.set(userId, null)
    }
  }

  // Return only active memberships
  const activeMembers: OrgMembership[] = []
  for (const membership of membershipByUser.values()) {
    if (membership) {
      activeMembers.push(membership)
    }
  }

  return activeMembers
}

/**
 * Get member count for an organization
 */
async function getOrgMemberCount(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const members = await getOrgMembers(supabase, orgId)
  return members.length
}

/**
 * Get video count for an organization
 */
async function getOrgVideoCount(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  // Get all video_client_org_set events
  const { data: orgSetEvents, error } = await supabase
    .from('video_events')
    .select('video_id, details, created_at')
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.VIDEO_ORG_SET)
    .order('created_at', { ascending: true })

  if (error || !orgSetEvents) {
    return 0
  }

  // Compute current org assignment per video
  const videoOrgMap = new Map<string, string>()
  for (const event of orgSetEvents) {
    if (event.video_id && event.details?.org_id) {
      videoOrgMap.set(event.video_id, event.details.org_id)
    }
  }

  // Count videos assigned to this org
  let count = 0
  for (const assignedOrgId of videoOrgMap.values()) {
    if (assignedOrgId === orgId) {
      count++
    }
  }

  return count
}

/**
 * Get last activity timestamp for an organization
 */
async function getOrgLastActivity(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  // Check most recent membership event from events_log
  const { data: memberEvent } = await supabase
    .from('events_log')
    .select('created_at')
    .eq('entity_type', 'client_org')
    .eq('entity_id', orgId)
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.MEMBER_SET)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let lastActivity: string | null = memberEvent?.created_at || null

  // Check most recent video assignment event (still in video_events)
  const { data: videoEvents } = await supabase
    .from('video_events')
    .select('created_at, details')
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.VIDEO_ORG_SET)
    .order('created_at', { ascending: false })
    .limit(100)

  if (videoEvents) {
    for (const event of videoEvents) {
      if ((event.details as Record<string, unknown>)?.org_id === orgId) {
        if (!lastActivity || event.created_at > lastActivity) {
          lastActivity = event.created_at
        }
        break
      }
    }
  }

  return lastActivity
}

/**
 * Get all videos assigned to an organization
 */
export async function getOrgVideos(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  // Get all video_client_org_set events
  const { data: orgSetEvents, error } = await supabase
    .from('video_events')
    .select('video_id, details, created_at')
    .eq('event_type', CLIENT_ORG_EVENT_TYPES.VIDEO_ORG_SET)
    .order('created_at', { ascending: true })

  if (error || !orgSetEvents) {
    return []
  }

  // Compute current org assignment per video
  const videoOrgMap = new Map<string, string>()
  for (const event of orgSetEvents) {
    if (event.video_id && event.details?.org_id) {
      videoOrgMap.set(event.video_id, event.details.org_id)
    }
  }

  // Return video IDs assigned to this org
  const videoIds: string[] = []
  for (const [videoId, assignedOrgId] of videoOrgMap.entries()) {
    if (assignedOrgId === orgId) {
      videoIds.push(videoId)
    }
  }

  return videoIds
}

/**
 * Require user to have a client org membership, throw standardized error if not
 */
export async function requireClientOrgForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<OrgMembership> {
  const membership = await getPrimaryClientOrgForUser(supabase, userId)
  if (!membership) {
    const error = new Error('client_org_required') as Error & { code: string; statusCode: number }
    error.code = 'CLIENT_ORG_REQUIRED'
    error.statusCode = 403
    throw error
  }
  return membership
}

/**
 * Check if a video belongs to the user's organization
 */
export async function isVideoInUserOrg(
  supabase: SupabaseClient,
  userId: string,
  videoId: string
): Promise<boolean> {
  const membership = await getPrimaryClientOrgForUser(supabase, userId)
  if (!membership) {
    return false
  }

  const videoOrgId = await getVideoOrgId(supabase, videoId)
  if (!videoOrgId) {
    return false
  }

  return videoOrgId === membership.org_id
}
