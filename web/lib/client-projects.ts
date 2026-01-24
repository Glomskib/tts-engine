/**
 * Client Projects Resolver
 *
 * Event-based project management for client organizations.
 * Uses video_events table with video_id nullable for project-level events.
 *
 * Event types:
 * - client_project_created: { org_id, project_id, project_name, created_by_user_id }
 * - client_project_archived: { org_id, project_id, archived_by_user_id }
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
    // Get all project creation events
    const { data: createdEvents, error: createdError } = await supabase
      .from('video_events')
      .select('details, created_at')
      .eq('event_type', PROJECT_EVENT_TYPES.PROJECT_CREATED)
      .order('created_at', { ascending: false })

    if (createdError || !createdEvents) {
      console.error('Error fetching project events:', createdError)
      return []
    }

    // Filter to this org's projects
    const orgProjects = createdEvents.filter(
      (e) => e.details?.org_id === orgId
    )

    // Get all archive events to determine archived status
    const { data: archiveEvents } = await supabase
      .from('video_events')
      .select('details, created_at')
      .eq('event_type', PROJECT_EVENT_TYPES.PROJECT_ARCHIVED)
      .order('created_at', { ascending: true })

    // Build archive status map
    const archivedMap = new Map<string, string>()
    if (archiveEvents) {
      for (const event of archiveEvents) {
        if (event.details?.org_id === orgId && event.details?.project_id) {
          archivedMap.set(event.details.project_id, event.created_at)
        }
      }
    }

    // Build projects list (most recent creation event wins for name)
    const projectMap = new Map<string, ClientProject>()
    for (const event of orgProjects) {
      const projectId = event.details?.project_id
      if (!projectId || projectMap.has(projectId)) continue

      const isArchived = archivedMap.has(projectId)

      projectMap.set(projectId, {
        project_id: projectId,
        project_name: event.details?.project_name || 'Unnamed Project',
        org_id: orgId,
        created_at: event.created_at,
        created_by_user_id: event.details?.created_by_user_id,
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
    // Get project creation event
    const { data: createdEvents, error } = await supabase
      .from('video_events')
      .select('details, created_at')
      .eq('event_type', PROJECT_EVENT_TYPES.PROJECT_CREATED)
      .order('created_at', { ascending: false })

    if (error || !createdEvents) {
      return null
    }

    // Find this project
    const projectEvent = createdEvents.find(
      (e) => e.details?.org_id === orgId && e.details?.project_id === projectId
    )

    if (!projectEvent) {
      return null
    }

    // Check if archived
    const { data: archiveEvents } = await supabase
      .from('video_events')
      .select('details, created_at')
      .eq('event_type', PROJECT_EVENT_TYPES.PROJECT_ARCHIVED)
      .order('created_at', { ascending: false })
      .limit(100)

    let isArchived = false
    let archivedAt: string | undefined

    if (archiveEvents) {
      const archiveEvent = archiveEvents.find(
        (e) => e.details?.org_id === orgId && e.details?.project_id === projectId
      )
      if (archiveEvent) {
        isArchived = true
        archivedAt = archiveEvent.created_at
      }
    }

    return {
      project_id: projectId,
      project_name: projectEvent.details?.project_name || 'Unnamed Project',
      org_id: orgId,
      created_at: projectEvent.created_at,
      created_by_user_id: projectEvent.details?.created_by_user_id,
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
