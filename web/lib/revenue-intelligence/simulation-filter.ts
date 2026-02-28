/**
 * Revenue Intelligence – Simulation Data Filter
 *
 * Centralized predicate for identifying simulation rows.
 * Simulation data uses platform_comment_id starting with 'sim_'
 * and platform_video_id starting with 'sim_'.
 */

const SIM_PREFIX = 'sim_';

/** Returns true if the platform_comment_id belongs to simulation data. */
export function isSimulationComment(platformCommentId: string): boolean {
  return platformCommentId.startsWith(SIM_PREFIX);
}

/** Returns true if the platform_video_id belongs to simulation data. */
export function isSimulationVideo(platformVideoId: string): boolean {
  return platformVideoId.startsWith(SIM_PREFIX);
}

/**
 * Supabase filter pattern for excluding simulation comments.
 * Use as: query.not('platform_comment_id', 'like', SIM_COMMENT_PATTERN)
 */
export const SIM_COMMENT_PATTERN = 'sim\\_%';

/**
 * Supabase filter pattern for excluding simulation videos.
 * Use as: query.not('platform_video_id', 'like', SIM_VIDEO_PATTERN)
 */
export const SIM_VIDEO_PATTERN = 'sim\\_%';
