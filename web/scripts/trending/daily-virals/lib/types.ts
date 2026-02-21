/**
 * Shared types for the Daily Virals trending scraper.
 */

export interface TrendingMetrics {
  views?: string;
  gmv?: string;
  velocity?: string;
  units_sold?: string;
  revenue?: string;
  commission_rate?: string;
  likes?: string;
  shares?: string;
  [key: string]: string | undefined;
}

export interface TrendingItem {
  rank: number;
  title: string;
  product_name: string;
  category: string;
  metrics: TrendingMetrics;
  hook_text: string;
  script_snippet: string;
  source_url: string;
  thumbnail_url: string;
  ai_observation: string;
  captured_at: string;
}

export interface ScrapeResult {
  items: TrendingItem[];
  screenshotPaths: string[];
  warnings: string[];
  errors: string[];
  blocked: boolean;
  blockReason?: string;
}

export interface MCPostResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface RunConfig {
  dryRun: boolean;
  maxItems: number;
  skipScreenshots: boolean;
  date: string;
}
