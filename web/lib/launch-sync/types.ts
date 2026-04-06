/**
 * LaunchSync types — Amazon → TikTok product launch + affiliate + content tracking.
 */

export type LaunchMode = 'solo' | 'agency';

export type LaunchStatus =
  | 'draft'
  | 'generating'
  | 'ready'
  | 'active'
  | 'scaling'
  | 'paused'
  | 'completed';

export const LAUNCH_STATUSES: LaunchStatus[] = [
  'draft', 'generating', 'ready', 'active', 'scaling', 'paused', 'completed',
];

export const LAUNCH_STATUS_LABELS: Record<LaunchStatus, string> = {
  draft: 'Draft',
  generating: 'Generating',
  ready: 'Ready',
  active: 'Active',
  scaling: 'Scaling',
  paused: 'Paused',
  completed: 'Completed',
};

export const LAUNCH_STATUS_COLORS: Record<LaunchStatus, { bg: string; text: string; dot: string }> = {
  draft:      { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-400' },
  generating: { bg: 'bg-violet-500/10', text: 'text-violet-400', dot: 'bg-violet-400' },
  ready:      { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  active:     { bg: 'bg-teal-500/10', text: 'text-teal-400', dot: 'bg-teal-400' },
  scaling:    { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  paused:     { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
  completed:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
};

export type LaunchContentStatus =
  | 'idea'
  | 'script_ready'
  | 'assigned'
  | 'recording'
  | 'recorded'
  | 'editing'
  | 'ready_to_post'
  | 'posted'
  | 'performing'
  | 'winner'
  | 'failed';

export const CONTENT_STATUS_LABELS: Record<LaunchContentStatus, string> = {
  idea: 'Idea',
  script_ready: 'Script Ready',
  assigned: 'Assigned',
  recording: 'Recording',
  recorded: 'Recorded',
  editing: 'Editing',
  ready_to_post: 'Ready to Post',
  posted: 'Posted',
  performing: 'Performing',
  winner: 'Winner',
  failed: 'Failed',
};

export const CONTENT_STATUS_COLORS: Record<LaunchContentStatus, { bg: string; text: string; dot: string }> = {
  idea:          { bg: 'bg-zinc-500/10', text: 'text-zinc-400', dot: 'bg-zinc-400' },
  script_ready:  { bg: 'bg-violet-500/10', text: 'text-violet-400', dot: 'bg-violet-400' },
  assigned:      { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  recording:     { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-400' },
  recorded:      { bg: 'bg-indigo-500/10', text: 'text-indigo-400', dot: 'bg-indigo-400' },
  editing:       { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
  ready_to_post: { bg: 'bg-teal-500/10', text: 'text-teal-400', dot: 'bg-teal-400' },
  posted:        { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  performing:    { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  winner:        { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  failed:        { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
};

export type AffiliateInviteStatus = 'pending' | 'accepted' | 'declined' | 'removed';
export type AffiliateStatus = 'active' | 'inactive' | 'top_performer' | 'dropped';

export interface HookSeed {
  text: string;
  angle: string;
  style: string;
}

export interface ScriptSeed {
  title: string;
  hook: string;
  body: string;
  cta: string;
  tone: string;
}

export interface AngleSeed {
  angle: string;
  description: string;
}

export interface ProductLaunch {
  id: string;
  workspace_id: string;
  product_id: string | null;
  brand_id: string | null;
  title: string;
  asin: string | null;
  source_url: string | null;
  tiktok_url: string | null;
  image_url: string | null;
  cost_per_unit: number | null;
  selling_price: number | null;
  mode: LaunchMode;
  status: LaunchStatus;
  target_videos: number;
  target_affiliates: number;
  hooks: HookSeed[];
  scripts: ScriptSeed[];
  angles: AngleSeed[];
  creator_brief: string | null;
  total_videos_created: number;
  total_videos_posted: number;
  total_views: number;
  total_orders: number;
  total_revenue: number;
  best_video_views: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LaunchAffiliate {
  id: string;
  launch_id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  tiktok_handle: string | null;
  platform: string;
  invite_code: string | null;
  invite_status: AffiliateInviteStatus;
  invited_at: string;
  accepted_at: string | null;
  user_id: string | null;
  commission_pct: number;
  videos_created: number;
  videos_posted: number;
  total_views: number;
  total_orders: number;
  total_revenue: number;
  notes: string | null;
  status: AffiliateStatus;
  created_at: string;
  updated_at: string;
}

export interface LaunchContent {
  id: string;
  launch_id: string;
  workspace_id: string;
  affiliate_id: string | null;
  creator_name: string | null;
  content_item_id: string | null;
  title: string | null;
  hook_text: string | null;
  script_text: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  status: LaunchContentStatus;
  platform: string;
  platform_video_id: string | null;
  posted_at: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  orders: number;
  revenue: number;
  is_winner: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Launch with nested content + affiliate counts */
export interface ProductLaunchWithCounts extends ProductLaunch {
  content_count?: number;
  affiliate_count?: number;
  product_name?: string;
  brand_name?: string;
}
