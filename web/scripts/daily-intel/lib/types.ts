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

export interface PipelineResult {
  pipeline: string;
  articlesFound: number;
  intelDocId?: string;
  draftsDocId?: string;
  bufferPushed: boolean;
  warnings: string[];  // non-fatal (source fetch failures)
  errors: string[];    // fatal (Claude API, MC post failures)
  log: string[];
}
