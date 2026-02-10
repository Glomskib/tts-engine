import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const SECOND_BRAIN_ROOT = path.join(
  process.env.HOME || '/root',
  '.openclaw/agents/flashflow-work/workspace/second-brain'
);

/**
 * GET /api/second-brain/tags
 * List all tags derived from folder structure and file patterns.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const tagCounts: Record<string, number> = {};
    const folders: string[] = [];

    await scanForTags(SECOND_BRAIN_ROOT, SECOND_BRAIN_ROOT, tagCounts, folders);

    const tags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      ok: true,
      tags,
      folders: [...new Set(folders)].sort(),
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Tags scan error:`, error);
    return createApiErrorResponse('INTERNAL', 'Failed to scan tags', 500, correlationId);
  }
}

async function scanForTags(
  dir: string,
  baseDir: string,
  tagCounts: Record<string, number>,
  folders: string[]
): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const relFolder = path.relative(baseDir, fullPath);
        folders.push(relFolder);
        await scanForTags(fullPath, baseDir, tagCounts, folders);
      } else if (entry.name.endsWith('.md')) {
        const folder = path.relative(baseDir, dir);
        const folderTag = folder !== '.' ? folder : 'root';

        tagCounts[folderTag] = (tagCounts[folderTag] || 0) + 1;

        // File-based tags
        if (entry.name.includes('journal') || folder === 'journals') {
          tagCounts['journal'] = (tagCounts['journal'] || 0) + 1;
        }
        if (entry.name.includes('research') || folder === 'research') {
          tagCounts['research'] = (tagCounts['research'] || 0) + 1;
        }
        if (entry.name.includes('review') || folder === 'business') {
          tagCounts['business'] = (tagCounts['business'] || 0) + 1;
        }
        if (folder === 'content-ideas') {
          tagCounts['content'] = (tagCounts['content'] || 0) + 1;
        }
        if (folder === 'projects') {
          tagCounts['project'] = (tagCounts['project'] || 0) + 1;
        }
      }
    }
  } catch {}
}
