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
 * GET /api/second-brain/documents/[filename]
 * Get document content. The filename can include folder path (e.g., "journals/2026-02-10-daily.md")
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { filename } = await params;
  const decodedFilename = decodeURIComponent(filename);

  // Security: prevent directory traversal
  if (decodedFilename.includes('..')) {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid filename', 400, correlationId);
  }

  try {
    // Try direct match first
    let filePath = path.join(SECOND_BRAIN_ROOT, decodedFilename);

    // If not found, search recursively
    try {
      await fs.access(filePath);
    } catch {
      // Search for the file in subdirectories
      const found = await findFile(SECOND_BRAIN_ROOT, decodedFilename);
      if (found) {
        filePath = found;
      } else {
        return createApiErrorResponse('NOT_FOUND', 'Document not found', 404, correlationId);
      }
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const stat = await fs.stat(filePath);
    const relativePath = path.relative(SECOND_BRAIN_ROOT, filePath);

    return NextResponse.json({
      ok: true,
      document: {
        filename: path.basename(filePath),
        folder: path.dirname(relativePath),
        path: relativePath,
        content,
        size: stat.size,
        created_at: stat.birthtime.toISOString(),
        modified_at: stat.mtime.toISOString(),
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Document read error:`, error);
    return createApiErrorResponse('INTERNAL', 'Failed to read document', 500, correlationId);
  }
}

async function findFile(dir: string, name: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await findFile(fullPath, name);
        if (found) return found;
      } else if (entry.name === name) {
        return fullPath;
      }
    }
  } catch {}
  return null;
}
