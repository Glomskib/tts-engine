/**
 * Client Projects Resolver
 *
 * Event-based project management for client organizations.
 * Uses events_log for project-level events and video_events for video-scoped events.
 *
 * Event types in events_log (entity_type='client_project', entity_id=project_id):
 * - client_project_created: { org_id, project_name, created_by_user_id }
 * - client_project_archived: { org_id, archived_by_user_id }
 *
 * Event types in video_events (requires valid video_id):
 * - video_project_set: { org_id, project_id, set_by_user_id }
 */

import { SupabaseClient } from '@supabase/supabase-js'

// Types
export interface ClientProject {
  project_id: string
  project_name: string
  org_id: string
  created_at: string
  created_by_user_id: string
  is_archived: boolean
  archived_at?: string
}

export interface ProjectWithStats extends ClientProject {
  video_count: number
}

// Event type constants
export const PROJECT_EVENT_TYPES = {
  PROJECT_CREATED: 'client_project_created',
  PROJECT_ARCHIVED: 'client_project_archived',
  VIDEO_PROJECT_SET: 'video_project_set',
} as const

/**
 * List all projects for an organization
 */
export async function listOrgProjects(
  supabase: SupabaseClient,
  orgId: string,
  options: { includeArchived?: boolean } = {}
): Promise<ProjectWithStats[]> {
  const { includeArchived = false } = options

  try {
    // Get all project creation events from events_log
    const { data: createdEvents, error: createdError } = await supabase
      .from('events_log')
      .select('entity_id, payload, created_at')
      .eq('entity_type', 'client_project')
      .eq('event_type', PROJECT_EVENT_TYPES.PROJECT_CREATED)
      .order('created_at', { ascending: false })

    if (createdError || !createdEvents) {
      console.error('Error fetching project events:', createdError)
      return []
    }

    // Filter to this org's projects
    const orgProjects = createdEvents.filter(
      (e) => (e.payload as Record<string, unknown>)?.org_id === orgId
    )

    // Get project IDs
    const projectIds = orgProjects.map((e) => e.entity_id)

    // Get all archive events for these projects
    const { data: archiveEvents } = projectIds.length > 0
      ? await supabase
          .from('events_log')
          .select('entity_id, created_at')
          .eq('entity_type', 'client_project')
          .eq('event_type', PROJECT_EVENT_TYPES.PROJECT_ARCHIVED)
          .in('entity_id', projectIds)
          .order('created_at', { ascending: true })
      : { data: [] }

    // Build archive status map
    const archivedMap = new Map<string, string>()
    if (archiveEvents) {
      for (const event of archiveEvents) {
        archivedMap.set(event.entity_id, event.created_at)
      }
    }

    // Build projects list (most recent creation event wins for name)
    const projectMap = new Map<string, ClientProject>()
    for (const event of orgProjects) {
      const projectId = event.entity_id
      if (projectMap.has(projectId)) continue

      const payload = event.payload as Record<string, unknown>
      const isArchived = archivedMap.has(projectId)

      projectMap.set(projectId, {
        project_id: projectId,
        project_name: (payload?.project_name as string) || 'Unnamed Project',
        org_id: orgId,
        created_at: event.created_at,
        created_by_user_id: payload?.created_by_user_id as string,
        is_archived: isArchived,
        archived_at: isArchived ? archivedMap.get(projectId) : undefined,
      })
    }

    // Filter archived if needed
    let projects = Array.from(projectMap.values())
    if (!includeArchived) {
      projects = projects.filter((p) => !p.is_archived)
    }

    // Get video counts for each project
    const projectsWithStats: ProjectWithStats[] = []
    for (const project of projects) {
      const videoCount = await getProjectVideoCount(supabase, orgId, project.project_id)
      projectsWithStats.push({
        ...project,
        video_count: videoCount,
      })
    }

    // Sort by created_at descending
    projectsWithStats.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    return projectsWithStats
  } catch (err) {
    console.error('Error listing org projects:', err)
    return []
  }
}

/**
 * Get a specific project by ID
 */
export async function getProjectById(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string
): Promise<ClientProject | null> {
  try {
    // Get project creation event from events_log
    const { data: projectEvent, error } = await supabase
      .from('events_log')
      .select('entity_id, payload, created_at')
      .eq('entity_type', 'client_project')
      .eq('entity_id', projectId)
      .eq('event_type', PROJECT_EVENT_TYPES.PROJECT_CREATED)
      .maybeSingle()

    if (error || !projectEvent) {
      return null
    }

    const payload = projectEvent.payload as Record<string, unknown>

    // Verify it belongs to the specified org
    if (payload?.org_id !== orgId) {
      return null
    }

    // Check if archived
    const { data: archiveEvent } = await supabase
      .from('events_log')
      .select('created_at')
      .eq('entity_type', 'client_project')
      .eq('entity_id', projectId)
      .eq('event_type', PROJECT_EVENT_TYPES.PROJECT_ARCHIVED)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const isArchived = !!archiveEvent
    const archivedAt = archiveEvent?.created_at

    return {
      project_id: projectId,
      project_name: (payload?.project_name as string) || 'Unnamed Project',
      org_id: orgId,
      created_at: projectEvent.created_at,
      created_by_user_id: payload?.created_by_user_id as string,
      is_archived: isArchived,
      archived_at: archivedAt,
    }
  } catch (err) {
    console.error('Error getting project by ID:', err)
    return null
  }
}

/**
 * Get the project ID for a video
 */
export async function getVideoProjectId(
  supabase: SupabaseClient,
  videoId: string
): Promise<string | null> {
  try {
    // Get most recent video_project_set event for this video
    const { data: events, error } = await supabase
      .from('video_events')
      .select('details')
      .eq('video_id', videoId)
      .eq('event_type', PROJECT_EVENT_TYPES.VIDEO_PROJECT_SET)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !events || events.length === 0) {
      return null
    }

    return events[0].details?.project_id || null
  } catch (err) {
    console.error('Error getting video project ID:', err)
    return null
  }
}

/**
 * List all videos in a project
 */
export async function listProjectVideos(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string
): Promise<string[]> {
  try {
    // Get all video_project_set events
    const { data: events, error } = await supabase
      .from('video_events')
      .select('video_id, details, created_at')
      .eq('event_type', PROJECT_EVENT_TYPES.VIDEO_PROJECT_SET)
      .order('created_at', { ascending: true })

    if (error || !events) {
      return []
    }

    // Compute current project assignment per video
    const videoProjectMap = new Map<string, string>()
    for (const event of events) {
      if (event.video_id && event.details?.project_id && event.details?.org_id === orgId) {
        videoProjectMap.set(event.video_id, event.details.project_id)
      }
    }

    // Filter to videos in this project
    const videoIds: string[] = []
    for (const [videoId, assignedProjectId] of videoProjectMap.entries()) {
      if (assignedProjectId === projectId) {
        videoIds.push(videoId)
      }
    }

    return videoIds
  } catch (err) {
    console.error('Error listing project videos:', err)
    return []
  }
}

/**
 * Get video count for a project
 */
async function getProjectVideoCount(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string
): Promise<number> {
  const videoIds = await listProjectVideos(supabase, orgId, projectId)
  return videoIds.length
}

/**
 * Get all video-project mappings for an organization
 */
export async function getOrgVideoProjectMappings(
  supabase: SupabaseClient,
  orgId: string
): Promise<Map<string, string>> {
  try {
    // Get all video_project_set events for this org
    const { data: events, error } = await supabase
      .from('video_events')
      .select('video_id, details, created_at')
      .eq('event_type', PROJECT_EVENT_TYPES.VIDEO_PROJECT_SET)
      .order('created_at', { ascending: true })

    if (error || !events) {
      return new Map()
    }

    // Compute current project assignment per video
    const videoProjectMap = new Map<string, string>()
    for (const event of events) {
      if (event.video_id && event.details?.project_id && event.details?.org_id === orgId) {
        videoProjectMap.set(event.video_id, event.details.project_id)
      }
    }

    return videoProjectMap
  } catch (err) {
    console.error('Error getting org video-project mappings:', err)
    return new Map()
  }
}
