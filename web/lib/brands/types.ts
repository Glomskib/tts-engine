/**
 * Brand Creative Testing Engine — TypeScript types
 */

export interface BrandMember {
  id: string;
  brand_id: string;
  user_id: string;
  role: 'operator' | 'client';
  invited_by: string | null;
  created_at: string;
}

export interface Experiment {
  id: string;
  workspace_id: string;
  brand_id: string | null;
  product_id: string | null;
  name: string;
  goal: string | null;
  hypothesis: string | null;
  status: 'draft' | 'running' | 'paused' | 'completed';
  hook_count: number;
  winner_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  campaign_config?: Record<string, unknown> | null;
  // Joined fields
  brand_name?: string;
  product_name?: string;
}

export interface ExperimentCreative {
  id: string;
  experiment_id: string;
  content_item_id: string;
  hook: string | null;
  angle: string | null;
  persona: string | null;
  cta: string | null;
  is_winner: boolean;
  created_at: string;
  // Joined fields
  content_item_title?: string;
  content_item_status?: string;
}

export type ExperimentStatus = Experiment['status'];

export interface VelocityMetrics {
  creatives_this_month: number;
  creatives_last_month: number;
  velocity_change: number; // percentage
  active_experiments: number;
  total_winners: number;
  avg_engagement_rate: number;
}

export interface BrandDashboardData {
  brand: {
    id: string;
    name: string;
  };
  velocity: VelocityMetrics;
  experiments: Experiment[];
  recent_winners: ExperimentCreative[];
}
