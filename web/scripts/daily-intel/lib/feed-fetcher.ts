/**
 * RSS feed parser + HTML scraper for daily intel pipeline.
 * Uses xml-js for RSS and cheerio for scrape fallbacks.
 * Each source has a 10s timeout; failures are non-fatal.
 *
 * Includes:
 * - Dedupe by normalized URL + title similarity
 * - Freshness filter: only 7-day-old articles (or labeled "date_unknown")
 */

import { xml2js, type Element, type ElementCompact } from 'xml-js';
import * as cheerio from 'cheerio';
import type { FeedSource, Article, FetchResult } from './types';

const FETCH_TIMEOUT_MS = 10_000;
const FRESHNESS_DAYS = 7;

async function fetchWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FlashFlow-DailyIntel/1.0',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRSS(xml: string, sourceName: string): Article[] {
  const result = xml2js(xml, { compact: true }) as ElementCompact;
  const articles: Article[] = [];

  // Handle RSS 2.0 (<rss><channel><item>)
  const channel = result?.rss?.channel;
  if (channel) {
    const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
    for (const item of items) {
      const title = item.title?._cdata || item.title?._text || '';
      const link = item.link?._text || item.link?._cdata || '';
      const pubDate = item.pubDate?._text || '';
      const description = item.description?._cdata || item.description?._text || '';
      if (title && link) {
        articles.push({
          title: String(title).trim(),
          url: String(link).trim(),
          source: sourceName,
          publishedAt: pubDate ? String(pubDate) : undefined,
          summary: description ? String(description).replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
        });
      }
    }
    return articles;
  }

  // Handle Atom (<feed><entry>)
  const feed = result?.feed;
  if (feed) {
    const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
    for (const entry of entries) {
      const title = entry.title?._text || entry.title?._cdata || '';
      const link = entry.link?._attributes?.href || '';
      const published = entry.published?._text || entry.updated?._text || '';
      const summary = entry.summary?._text || '';
      if (title && link) {
        articles.push({
          title: String(title).trim(),
          url: String(link).trim(),
          source: sourceName,
          publishedAt: published ? String(published) : undefined,
          summary: summary ? String(summary).replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
        });
      }
    }
    return articles;
  }

  return articles;
}

function scrapeHTML(html: string, source: FeedSource): Article[] {
  const $ = cheerio.load(html);
  const articles: Article[] = [];
  const seen = new Set<string>();

  const linkSel = source.linkSelector || 'a';
  $(linkSel).each((_, el) => {
    const $el = $(el);
    let href = $el.attr('href') || '';
    const title = $el.text().trim();

    if (!href || !title || title.length < 10) return;

    // Resolve relative URLs
    if (href.startsWith('/')) {
      try {
        const base = new URL(source.url);
        href = `${base.origin}${href}`;
      } catch { return; }
    }

    if (seen.has(href)) return;
    seen.add(href);

    articles.push({
      title,
      url: href,
      source: source.name,
    });
  });

  return articles;
}

async function fetchSource(source: FeedSource): Promise<{ articles: Article[]; error?: string }> {
  try {
    const text = await fetchWithTimeout(source.url);
    const articles = source.type === 'rss' ? parseRSS(text, source.name) : scrapeHTML(text, source);
    return { articles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { articles: [], error: `[${source.name}] ${msg}` };
  }
}

// --- Dedupe + freshness helpers ---

/**
 * Normalize a URL for dedup comparison: strip protocol, www, trailing slash,
 * query params like utm_*, and fragment.
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove tracking params
    const keysToRemove: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|mc_[ce]id|ref)$/i.test(key)) {
        keysToRemove.push(key);
      }
    });
    for (const k of keysToRemove) u.searchParams.delete(k);
    u.hash = '';
    // Normalize host
    let host = u.hostname.replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '');
    const search = u.searchParams.toString();
    return `${host}${path}${search ? '?' + search : ''}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Normalize a title for similarity comparison:
 * lowercase, strip punctuation, collapse whitespace.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple word-overlap similarity (Jaccard-like).
 * Returns 0..1 where 1 = identical word sets.
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 2));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

/**
 * Check freshness of an article by its publishedAt field.
 * Returns 'fresh' if within FRESHNESS_DAYS, 'date_unknown' if no date.
 * Articles older than FRESHNESS_DAYS are excluded (returns null).
 */
function checkFreshness(article: Article): 'fresh' | 'date_unknown' | null {
  if (!article.publishedAt) return 'date_unknown';
  try {
    const pubDate = new Date(article.publishedAt);
    if (isNaN(pubDate.getTime())) return 'date_unknown';
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FRESHNESS_DAYS);
    if (pubDate < cutoff) return null; // stale
    return 'fresh';
  } catch {
    return 'date_unknown';
  }
}

/**
 * Deduplicate articles by:
 * 1. Exact normalized URL match
 * 2. Title similarity > 0.8 (catches same story from different sources/URLs)
 */
function dedupeArticles(articles: Article[]): Article[] {
  const kept: Article[] = [];
  const seenUrls = new Set<string>();
  const keptTitles: string[] = [];

  for (const article of articles) {
    const normUrl = normalizeUrl(article.url);
    if (seenUrls.has(normUrl)) continue;

    // Check title similarity against already-kept articles
    const normTitle = normalizeTitle(article.title);
    let isDupe = false;
    for (const existingTitle of keptTitles) {
      if (titleSimilarity(normTitle, existingTitle) > 0.8) {
        isDupe = true;
        break;
      }
    }
    if (isDupe) continue;

    seenUrls.add(normUrl);
    keptTitles.push(normTitle);
    kept.push(article);
  }

  return kept;
}

/**
 * Apply freshness filter: keep articles from last 7 days or label as date_unknown.
 * Returns filtered articles with freshness field set.
 */
function applyFreshness(articles: Article[]): { fresh: Article[]; staleCount: number } {
  const fresh: Article[] = [];
  let staleCount = 0;

  for (const article of articles) {
    const status = checkFreshness(article);
    if (status === null) {
      staleCount++;
      continue;
    }
    fresh.push({ ...article, freshness: status });
  }

  return { fresh, staleCount };
}

/**
 * Fetch all sources for a pipeline. Per-source failures are non-fatal.
 * Returns deduplicated + freshness-filtered articles and any errors encountered.
 */
export async function fetchAllSources(sources: FeedSource[]): Promise<FetchResult> {
  const results = await Promise.allSettled(sources.map(s => fetchSource(s)));

  const rawArticles: Article[] = [];
  const errors: string[] = [];

  for (const r of results) {
    if (r.status === 'rejected') {
      errors.push(`Unexpected rejection: ${r.reason}`);
      continue;
    }
    if (r.value.error) {
      errors.push(r.value.error);
    }
    rawArticles.push(...r.value.articles);
  }

  // Dedupe by normalized URL + title similarity
  const deduped = dedupeArticles(rawArticles);
  const dedupedCount = rawArticles.length - deduped.length;
  if (dedupedCount > 0) {
    errors.push(`[dedupe] Removed ${dedupedCount} duplicate articles`);
  }

  // Apply freshness filter
  const { fresh, staleCount } = applyFreshness(deduped);
  if (staleCount > 0) {
    errors.push(`[freshness] Filtered out ${staleCount} articles older than ${FRESHNESS_DAYS} days`);
  }

  return { articles: fresh, errors };
}
