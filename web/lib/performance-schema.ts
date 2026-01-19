import { supabaseAdmin } from './supabaseAdmin';

// Cache for schema columns to avoid repeated queries
let videoMetricsColumnsCache: Set<string> | null = null;
let videosPerformanceColumnsCache: Set<string> | null = null;
let variantsWinnerColumnsCache: Set<string> | null = null;

export async function getVideoMetricsColumns(): Promise<Set<string>> {
  if (videoMetricsColumnsCache) {
    return videoMetricsColumnsCache;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'video_metrics')
      .eq('table_schema', 'public');

    if (error) {
      console.error('Failed to fetch video_metrics columns:', error);
      // Return basic expected columns as fallback
      videoMetricsColumnsCache = new Set(['id', 'video_id', 'account_id', 'metric_date', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'orders', 'revenue', 'created_at', 'updated_at']);
      return videoMetricsColumnsCache;
    }

    const columns = new Set(data?.map((row: any) => row.column_name) || []);
    videoMetricsColumnsCache = columns;
    return columns;
  } catch (error) {
    console.error('Error checking video_metrics schema:', error);
    // Return basic expected columns as fallback
    videoMetricsColumnsCache = new Set(['id', 'video_id', 'account_id', 'metric_date', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'orders', 'revenue', 'created_at', 'updated_at']);
    return videoMetricsColumnsCache;
  }
}

export async function getVideosPerformanceColumns(): Promise<Set<string>> {
  if (videosPerformanceColumnsCache) {
    return videosPerformanceColumnsCache;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'videos')
      .eq('table_schema', 'public');

    if (error) {
      console.error('Failed to fetch videos columns:', error);
      videosPerformanceColumnsCache = new Set([]);
      return videosPerformanceColumnsCache;
    }

    const columns = new Set(data?.map((row: any) => row.column_name) || []);
    videosPerformanceColumnsCache = columns;
    return columns;
  } catch (error) {
    console.error('Error checking videos schema:', error);
    videosPerformanceColumnsCache = new Set([]);
    return videosPerformanceColumnsCache;
  }
}

export async function getVariantsWinnerColumns(): Promise<Set<string>> {
  if (variantsWinnerColumnsCache) {
    return variantsWinnerColumnsCache;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'variants')
      .eq('table_schema', 'public');

    if (error) {
      console.error('Failed to fetch variants columns:', error);
      variantsWinnerColumnsCache = new Set([]);
      return variantsWinnerColumnsCache;
    }

    const columns = new Set(data?.map((row: any) => row.column_name) || []);
    variantsWinnerColumnsCache = columns;
    return columns;
  } catch (error) {
    console.error('Error checking variants schema:', error);
    variantsWinnerColumnsCache = new Set([]);
    return variantsWinnerColumnsCache;
  }
}

// Clear cache when needed (e.g., after migrations)
export function clearPerformanceSchemaCache() {
  videoMetricsColumnsCache = null;
  videosPerformanceColumnsCache = null;
  variantsWinnerColumnsCache = null;
}
