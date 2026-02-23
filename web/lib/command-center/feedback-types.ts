/**
 * Feedback Inbox – shared TypeScript types.
 * Mirrors the SQL schema in 20260323200000_ff_feedback_items.sql.
 */

export type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'shipped' | 'rejected';
export type FeedbackType = 'bug' | 'feature' | 'improvement' | 'support' | 'other';
export type FeedbackSource = 'widget' | 'web' | 'telegram' | 'api' | 'email' | 'slack' | 'manual';

export interface FeedbackItem {
  id: string;
  created_at: string;
  updated_at: string;
  source: FeedbackSource;
  type: FeedbackType;
  title: string;
  description: string;
  page: string | null;
  device: string | null;
  reporter_email: string | null;
  reporter_user_id: string | null;
  status: FeedbackStatus;
  priority: number;
  assignee: string | null;
  tags: string[];
  raw_json: Record<string, unknown>;
  user_feedback_id: string | null;
}

export interface FeedbackStats {
  total: number;
  new: number;
  bugs: number;
  features: number;
}
