/**
 * Write trending.json to web/public/ for homepage feed consumption.
 *
 * Output: web/public/trending.json
 * Format: { date: "YYYY-MM-DD", generated_at: ISO, items: [...] }
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TrendingItem } from './types';

const TAG = '[daily-virals:public]';

export function writeTrendingJson(items: TrendingItem[], date: string): string {
  const publicDir = path.join(process.cwd(), 'public');
  fs.mkdirSync(publicDir, { recursive: true });

  const outputPath = path.join(publicDir, 'trending.json');

  const payload = {
    date,
    generated_at: new Date().toISOString(),
    source: 'daily_virals',
    items: items.map(item => ({
      rank: item.rank,
      product_name: item.product_name || item.title,
      category: item.category || null,
      views: item.metrics.views || null,
      gmv_velocity: item.metrics.gmv || item.metrics.velocity || null,
      hook_text: item.hook_text || null,
      source_url: item.source_url || null,
      thumbnail_url: item.thumbnail_url || null,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`${TAG} Wrote ${outputPath} (${items.length} items)`);

  return outputPath;
}
