/**
 * Export trending data to local files.
 *
 * Outputs:
 *   web/data/trending/daily-virals/YYYY-MM-DD/trending.json
 *   web/data/trending/daily-virals/YYYY-MM-DD/trending.csv
 *   web/data/trending/daily-virals/YYYY-MM-DD/screenshots/   (created empty)
 *   web/data/trending/daily-virals/latest.json                (symlink-like copy)
 *   web/data/trending/daily-virals/latest.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TrendingItem } from './types';

const TAG = '[daily-virals:export]';

const DATA_DIR = path.join(process.cwd(), 'data/trending/daily-virals');

interface ExportResult {
  dir: string;
  files: string[];
}

export function exportTrending(items: TrendingItem[], date: string): ExportResult {
  const dateDir = path.join(DATA_DIR, date);
  const screenshotDir = path.join(dateDir, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const files: string[] = [];
  const jsonData = JSON.stringify(items, null, 2);
  const csv = toCsv(items);

  // YYYY-MM-DD/trending.json
  const dateJsonPath = path.join(dateDir, 'trending.json');
  fs.writeFileSync(dateJsonPath, jsonData);
  files.push(dateJsonPath);
  console.log(`${TAG} Wrote ${dateJsonPath}`);

  // YYYY-MM-DD/trending.csv
  const dateCsvPath = path.join(dateDir, 'trending.csv');
  fs.writeFileSync(dateCsvPath, csv);
  files.push(dateCsvPath);
  console.log(`${TAG} Wrote ${dateCsvPath}`);

  // Root-level latest copies for quick access
  const latestJsonPath = path.join(DATA_DIR, 'latest.json');
  fs.writeFileSync(latestJsonPath, jsonData);
  files.push(latestJsonPath);

  const latestCsvPath = path.join(DATA_DIR, 'latest.csv');
  fs.writeFileSync(latestCsvPath, csv);
  files.push(latestCsvPath);

  console.log(`${TAG} Wrote latest.json + latest.csv`);

  return { dir: dateDir, files };
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(items: TrendingItem[]): string {
  const headers = [
    'rank', 'title', 'product_name', 'category',
    'views', 'gmv', 'velocity', 'units_sold', 'revenue',
    'hook_text', 'source_url', 'thumbnail_url',
    'ai_observation', 'captured_at',
  ];

  const rows = items.map(item => [
    String(item.rank),
    escapeCsv(item.title),
    escapeCsv(item.product_name),
    escapeCsv(item.category),
    escapeCsv(item.metrics.views ?? ''),
    escapeCsv(item.metrics.gmv ?? ''),
    escapeCsv(item.metrics.velocity ?? ''),
    escapeCsv(item.metrics.units_sold ?? ''),
    escapeCsv(item.metrics.revenue ?? ''),
    escapeCsv(item.hook_text),
    escapeCsv(item.source_url),
    escapeCsv(item.thumbnail_url),
    escapeCsv(item.ai_observation),
    item.captured_at,
  ].join(','));

  return [headers.join(','), ...rows].join('\n') + '\n';
}
