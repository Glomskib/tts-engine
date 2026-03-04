/**
 * Shared types for the daily intel pipeline.
 */

export interface FeedSource {
  name: string;
  url: string;
  type: 'rss' | 'scrape';
  /** CSS selector for article links (scrape sources only) */
  linkSelector?: string;
  /** CSS selector for article title (scrape sources only) */
  titleSelector?: string;
}

export interface Article {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  summary?: string;
  /** 'fresh' = within 7 days, 'stale' = older than 7 days (filtered out), 'date_unknown' = no date provided */
  freshness?: 'fresh' | 'date_unknown';
}

export interface FetchResult {
  articles: Article[];
  errors: string[];
}

export interface PipelineConfig {
  id: 'cycling' | 'eds';
  name: string;
  lane: string;
  sources: FeedSource[];
  intelPrompt: string;
  socialPrompt: string;
  intelDocTitle: (date: string) => string;
  draftsDocTitle: (date: string) => string;
  intelTags: string[];
  draftsTags: string[];
}

export interface SocialDraft {
  platform: string;
  content: string;
}

export interface CyclingDraft {
  platform: string;
  caption: string;
  hashtags: string[];
  hook: string;
  cta?: string;
}

export interface ZebbyDraft {
  scene_idea: string;
  image_prompt: string;
  caption: string;
  educational_note: string;
  disclaimer: string;
}

export interface PipelineResult {
  pipeline: string;
  articlesFound: number;
  intelDocId?: string;
  draftsDocId?: string;
  bufferPushed: boolean;  // legacy name; true = drafts queued to marketing engine
  marketingRunId?: string;
  marketingQueued?: number;
  warnings: string[];  // non-fatal (source fetch failures)
  errors: string[];    // fatal (Claude API, MC post failures)
  log: string[];
}
