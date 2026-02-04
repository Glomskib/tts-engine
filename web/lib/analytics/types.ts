/**
 * Analytics Types
 *
 * Type definitions for the Winners Bank analytics dashboard
 */

export interface AnalyticsOverview {
  totalScriptsGenerated: number;
  scriptsThisPeriod: number;
  totalWinners: number;
  winnersThisPeriod: number;
  winRate: number;
  avgWinnerViews: number;
  avgWinnerEngagement: number;
  totalViews: number;
}

export interface HookTypePerformance {
  type: string;
  label: string;
  count: number;
  avgEngagement: number;
  avgViews: number;
}

export interface ContentFormatPerformance {
  format: string;
  label: string;
  count: number;
  avgEngagement: number;
  avgViews: number;
}

export interface PersonaPerformance {
  persona: string;
  label: string;
  count: number;
  avgScore: number;
}

export interface VideoLengthStats {
  shortest: number;
  longest: number;
  avgWinning: number;
  sweetSpot: { min: number; max: number } | null;
}

export interface TopPerformers {
  hookTypes: HookTypePerformance[];
  contentFormats: ContentFormatPerformance[];
  personas: PersonaPerformance[];
  videoLengths: VideoLengthStats;
}

export interface WeeklyTrend {
  week: string;
  scripts: number;
  winners: number;
}

export interface EngagementTrend {
  week: string;
  avgEngagement: number;
  avgViews: number;
}

export interface Trends {
  scriptsOverTime: WeeklyTrend[];
  engagementOverTime: EngagementTrend[];
}

export interface Patterns {
  winning: string[];
  underperforming: string[];
}

export interface Recommendation {
  type: 'try_more' | 'keep_doing' | 'avoid';
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface WinnersAnalytics {
  overview: AnalyticsOverview;
  topPerformers: TopPerformers;
  trends: Trends;
  patterns: Patterns;
  recommendations: Recommendation[];
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

export const ANALYTICS_PERIODS = [
  { value: '7d' as const, label: 'Last 7 days', days: 7 },
  { value: '30d' as const, label: 'Last 30 days', days: 30 },
  { value: '90d' as const, label: 'Last 90 days', days: 90 },
  { value: 'all' as const, label: 'All time', days: null },
];

export const HOOK_TYPE_LABELS: Record<string, string> = {
  question: 'Question',
  bold_statement: 'Bold Statement',
  pov: 'POV',
  curiosity_gap: 'Curiosity Gap',
  controversy: 'Hot Take',
  relatable: 'Relatable',
  shock: 'Shock/Surprise',
  story: 'Story Start',
  list: 'Listicle',
  challenge: 'Challenge',
};

export const CONTENT_FORMAT_LABELS: Record<string, string> = {
  skit: 'Comedy Skit (Multi-Person)',
  story: 'Storytelling',
  tutorial: 'Tutorial',
  review: 'Review',
  comparison: 'Comparison',
  transformation: 'Before/After',
  day_in_life: 'Day in Life',
  grwm: 'GRWM',
  unboxing: 'Unboxing',
  trend: 'Trend/Sound',
};
