/**
 * Export trending data to local files.
 *
 * Outputs:
 *   web/data/trending/daily-virals/latest.json
 *   web/data/trending/daily-virals/YYYY-MM-DD.json
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
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const files: string[] = [];
  const jsonData = JSON.stringify(items, null, 2);

  // latest.json
  const latestJsonPath = path.join(DATA_DIR, 'latest.json');
  fs.writeFileSync(latestJsonPath, jsonData);
  files.push(latestJsonPath);
  console.log(`${TAG} Wrote ${latestJsonPath}`);

  // YYYY-MM-DD.json
  const dateJsonPath = path.join(DATA_DIR, `${date}.json`);
  fs.writeFileSync(dateJsonPath, jsonData);
  files.push(dateJsonPath);
  console.log(`${TAG} Wrote ${dateJsonPath}`);

  // latest.csv
  const csvPath = path.join(DATA_DIR, 'latest.csv');
  const csv = toCsv(items);
  fs.writeFileSync(csvPath, csv);
  files.push(csvPath);
  console.log(`${TAG} Wrote ${csvPath}`);

  return { dir: DATA_DIR, files };
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
