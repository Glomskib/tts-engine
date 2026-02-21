/**
 * Draft exporter — writes pipeline output to local filesystem.
 * Creates ~/DailyDrafts/YYYY-MM-DD/{cycling,eds}/ with drafts.md and drafts.json
 *
 * Also optionally pushes to Buffer if BUFFER_ACCESS_TOKEN is set.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

interface DraftExport {
  pipelineId: 'cycling' | 'eds';
  date: string;
  intelMarkdown: string;
  draftsMarkdown: string;
  draftsJson: Record<string, unknown>[];
}

/**
 * Export drafts to ~/DailyDrafts/YYYY-MM-DD/{cycling,eds}/
 * Creates directories as needed.
 */
export function exportDrafts(input: DraftExport): { dir: string; files: string[] } {
  const baseDir = resolve(homedir(), 'DailyDrafts', input.date, input.pipelineId);
  mkdirSync(baseDir, { recursive: true });

  const files: string[] = [];

  // Write intel report
  const intelPath = resolve(baseDir, 'intel.md');
  writeFileSync(intelPath, input.intelMarkdown, 'utf-8');
  files.push(intelPath);

  // Write drafts markdown
  const draftsMdPath = resolve(baseDir, 'drafts.md');
  writeFileSync(draftsMdPath, input.draftsMarkdown, 'utf-8');
  files.push(draftsMdPath);

  // Write drafts JSON
  const draftsJsonPath = resolve(baseDir, 'drafts.json');
  writeFileSync(
    draftsJsonPath,
    JSON.stringify(
      {
        pipeline: input.pipelineId,
        date: input.date,
        generatedAt: new Date().toISOString(),
        drafts: input.draftsJson,
      },
      null,
      2,
    ),
    'utf-8',
  );
  files.push(draftsJsonPath);

  return { dir: baseDir, files };
}
