// Script Export Utilities
// Provides multiple export formats for scripts

export interface SkitData {
  hook_line: string;
  beats: Array<{
    t: string;
    action: string;
    dialogue?: string;
    on_screen_text?: string;
  }>;
  b_roll: string[];
  overlays: string[];
  cta_line: string;
  cta_overlay: string;
}

export interface SavedSkit {
  id: string;
  title: string;
  skit_data: SkitData;
  product_name?: string;
  product_brand?: string;
  ai_score?: {
    overall_score?: number;
    hook_strength?: number;
    virality_potential?: number;
  };
  created_at: string;
  updated_at?: string;
}

// Export to plain text
export function exportToTxt(skit: SavedSkit, includeMetadata = false): string {
  const lines: string[] = [];

  lines.push(skit.title.toUpperCase());
  lines.push('='.repeat(skit.title.length));
  lines.push('');

  if (includeMetadata && (skit.product_name || skit.product_brand)) {
    lines.push(`Product: ${skit.product_name || ''} ${skit.product_brand ? `(${skit.product_brand})` : ''}`);
    lines.push('');
  }

  lines.push('HOOK:');
  lines.push(skit.skit_data.hook_line);
  lines.push('');

  lines.push('SCRIPT:');
  lines.push('-'.repeat(40));

  skit.skit_data.beats.forEach((beat) => {
    lines.push(`[${beat.t}]`);
    if (beat.action) lines.push(`  Action: ${beat.action}`);
    if (beat.dialogue) lines.push(`  Dialogue: "${beat.dialogue}"`);
    if (beat.on_screen_text) lines.push(`  Text Overlay: ${beat.on_screen_text}`);
    lines.push('');
  });

  if (skit.skit_data.b_roll.length > 0) {
    lines.push('B-ROLL SUGGESTIONS:');
    skit.skit_data.b_roll.forEach(item => lines.push(`  - ${item}`));
    lines.push('');
  }

  lines.push('CALL TO ACTION:');
  lines.push(`  Line: ${skit.skit_data.cta_line}`);
  lines.push(`  Overlay: ${skit.skit_data.cta_overlay}`);
  lines.push('');

  if (includeMetadata && skit.ai_score) {
    lines.push('AI SCORE:');
    lines.push(`  Overall: ${skit.ai_score.overall_score || 'N/A'}/10`);
    lines.push(`  Hook Strength: ${skit.ai_score.hook_strength || 'N/A'}/10`);
    lines.push(`  Virality: ${skit.ai_score.virality_potential || 'N/A'}/10`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`Generated with FlashFlow AI - ${new Date(skit.created_at).toLocaleDateString()}`);

  return lines.join('\n');
}

// Export to Markdown
export function exportToMarkdown(skit: SavedSkit, includeMetadata = false): string {
  const lines: string[] = [];

  lines.push(`# ${skit.title}`);
  lines.push('');

  if (includeMetadata && (skit.product_name || skit.product_brand)) {
    lines.push(`**Product:** ${skit.product_name || ''} ${skit.product_brand ? `(${skit.product_brand})` : ''}`);
    lines.push('');
  }

  lines.push('## Hook');
  lines.push(`> ${skit.skit_data.hook_line}`);
  lines.push('');

  lines.push('## Script Beats');
  lines.push('');

  skit.skit_data.beats.forEach((beat) => {
    lines.push(`### ${beat.t}`);
    if (beat.action) lines.push(`- **Action:** ${beat.action}`);
    if (beat.dialogue) lines.push(`- **Dialogue:** "${beat.dialogue}"`);
    if (beat.on_screen_text) lines.push(`- **Text:** \`${beat.on_screen_text}\``);
    lines.push('');
  });

  if (skit.skit_data.b_roll.length > 0) {
    lines.push('## B-Roll Suggestions');
    skit.skit_data.b_roll.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  if (skit.skit_data.overlays.length > 0) {
    lines.push('## Overlays');
    skit.skit_data.overlays.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  lines.push('## Call to Action');
  lines.push(`- **Line:** ${skit.skit_data.cta_line}`);
  lines.push(`- **Overlay:** ${skit.skit_data.cta_overlay}`);
  lines.push('');

  if (includeMetadata && skit.ai_score) {
    lines.push('## AI Score');
    lines.push(`| Metric | Score |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Overall | ${skit.ai_score.overall_score || 'N/A'}/10 |`);
    lines.push(`| Hook Strength | ${skit.ai_score.hook_strength || 'N/A'}/10 |`);
    lines.push(`| Virality | ${skit.ai_score.virality_potential || 'N/A'}/10 |`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated with [FlashFlow AI](https://flashflow.ai) on ${new Date(skit.created_at).toLocaleDateString()}*`);

  return lines.join('\n');
}

// Export to JSON
export function exportToJson(skit: SavedSkit, includeMetadata = true): string {
  const exportData = includeMetadata ? skit : {
    title: skit.title,
    skit_data: skit.skit_data,
  };
  return JSON.stringify(exportData, null, 2);
}

// Export to CSV (for multiple skits)
export function exportToCsv(skits: SavedSkit[]): string {
  const headers = ['Title', 'Hook', 'Beats', 'CTA', 'Product', 'Brand', 'Score', 'Created'];
  const rows = skits.map(skit => [
    escapeCSV(skit.title),
    escapeCSV(skit.skit_data.hook_line),
    skit.skit_data.beats.length.toString(),
    escapeCSV(skit.skit_data.cta_line),
    escapeCSV(skit.product_name || ''),
    escapeCSV(skit.product_brand || ''),
    skit.ai_score?.overall_score?.toString() || '',
    new Date(skit.created_at).toLocaleDateString(),
  ]);

  return [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
}

function escapeCSV(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Download helper
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export handlers
export function downloadAsTxt(skit: SavedSkit, includeMetadata = false) {
  const content = exportToTxt(skit, includeMetadata);
  const filename = `${sanitizeFilename(skit.title)}.txt`;
  downloadFile(content, filename, 'text/plain');
}

export function downloadAsMarkdown(skit: SavedSkit, includeMetadata = false) {
  const content = exportToMarkdown(skit, includeMetadata);
  const filename = `${sanitizeFilename(skit.title)}.md`;
  downloadFile(content, filename, 'text/markdown');
}

export function downloadAsJson(skit: SavedSkit, includeMetadata = true) {
  const content = exportToJson(skit, includeMetadata);
  const filename = `${sanitizeFilename(skit.title)}.json`;
  downloadFile(content, filename, 'application/json');
}

export function downloadAsCsv(skits: SavedSkit[], filename = 'scripts-export') {
  const content = exportToCsv(skits);
  downloadFile(content, `${filename}.csv`, 'text/csv');
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 50);
}

// Copy to clipboard
export async function copyToClipboard(skit: SavedSkit, format: 'txt' | 'md' | 'json' = 'txt'): Promise<boolean> {
  let content: string;

  switch (format) {
    case 'md':
      content = exportToMarkdown(skit, false);
      break;
    case 'json':
      content = exportToJson(skit, false);
      break;
    default:
      content = exportToTxt(skit, false);
  }

  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = content;
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}
