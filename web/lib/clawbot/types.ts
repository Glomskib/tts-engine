// Clawbot types — strategy, feedback, and performance data structures

export interface StrategyRequest {
  product_name: string;
  product_category?: string;
  brand_name?: string;
  product_context?: string;
  content_format?: string;
  risk_tier?: string;
  target_audience?: string;
  /** Recent winner patterns for context */
  winner_patterns?: WinnerPattern[];
  /** Recent feedback for learning */
  recent_feedback?: FeedbackSummary[];
}

export interface WinnerPattern {
  hook_text: string | null;
  hook_type: string | null;
  content_format: string | null;
  performance_score: number | null;
  engagement_rate: number | null;
  views: number | null;
  product_category: string | null;
}

export interface FeedbackSummary {
  strategy_used: StrategyResponse;
  feedback_type: "positive" | "negative" | "neutral";
  performance_outcome: PerformanceData | null;
}

export interface StrategyResponse {
  recommended_angle: string;
  tone_direction: string;
  risk_score: number; // 1-10
  reasoning: string;
  suggested_hooks: string[];
  content_approach: string;
  avoid: string[];
}

export interface PerformanceData {
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  engagement_rate?: number;
  recorded_at?: string;
}

export interface FeedbackInput {
  skit_id: string;
  video_id?: string;
  feedback_type: "positive" | "negative" | "neutral";
  notes?: string;
}

export interface ClawbotGenerateRequest {
  /** All fields from the original generate-skit request */
  [key: string]: unknown;
  product_id?: string;
  product_name?: string;
  brand_name?: string;
  risk_tier: string;
  persona: string;
}

export interface ClawbotGenerateResponse {
  /** Original skit generation response */
  ok: boolean;
  skits?: unknown[];
  /** Clawbot strategy metadata attached */
  strategy_metadata?: StrategyResponse;
  /** Whether Clawbot strategy was used or fell back */
  clawbot_active: boolean;
  correlation_id: string;
}
