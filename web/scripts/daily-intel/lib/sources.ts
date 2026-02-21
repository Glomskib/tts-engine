/**
 * Feed source registry for daily intel pipelines.
 * All RSS URLs verified as returning 200 OK.
 */

import type { FeedSource } from './types';

export const CYCLING_SOURCES: FeedSource[] = [
  {
    name: 'CyclingNews',
    url: 'https://www.cyclingnews.com/feeds.xml',
    type: 'rss',
  },
  {
    name: 'Bicycling',
    url: 'https://www.bicycling.com/rss/all.xml/',
    type: 'rss',
  },
  {
    name: 'Google News: Cycling',
    url: 'https://news.google.com/rss/search?q=cycling+news+when:3d&ceid=US:en&hl=en-US&gl=US',
    type: 'rss',
  },
];

export const EDS_SOURCES: FeedSource[] = [
  {
    name: 'Google News: EDS',
    url: 'https://news.google.com/rss/search?q=ehlers+danlos+syndrome+when:7d&ceid=US:en&hl=en-US&gl=US',
    type: 'rss',
  },
  {
    name: 'Google News: POTS Dysautonomia',
    url: 'https://news.google.com/rss/search?q=POTS+dysautonomia+when:7d&ceid=US:en&hl=en-US&gl=US',
    type: 'rss',
  },
  {
    name: 'Dysautonomia International',
    url: 'http://www.dysautonomiainternational.org/page.php?ID=100',
    type: 'scrape',
    linkSelector: 'a[href*="page.php"]',
    titleSelector: 'a[href*="page.php"]',
  },
];
