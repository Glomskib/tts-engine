/**
 * RSS feed parser + HTML scraper for daily intel pipeline.
 * Uses xml-js for RSS and cheerio for scrape fallbacks.
 * Each source has a 10s timeout; failures are non-fatal.
 */

import { xml2js, type Element, type ElementCompact } from 'xml-js';
import * as cheerio from 'cheerio';
import type { FeedSource, Article, FetchResult } from './types';

const FETCH_TIMEOUT_MS = 10_000;

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

/**
 * Fetch all sources for a pipeline. Per-source failures are non-fatal.
 * Returns deduplicated articles (by URL) and any errors encountered.
 */
export async function fetchAllSources(sources: FeedSource[]): Promise<FetchResult> {
  const results = await Promise.allSettled(sources.map(s => fetchSource(s)));

  const allArticles: Article[] = [];
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  for (const r of results) {
    if (r.status === 'rejected') {
      errors.push(`Unexpected rejection: ${r.reason}`);
      continue;
    }
    if (r.value.error) {
      errors.push(r.value.error);
    }
    for (const article of r.value.articles) {
      if (!seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        allArticles.push(article);
      }
    }
  }

  return { articles: allArticles, errors };
}
