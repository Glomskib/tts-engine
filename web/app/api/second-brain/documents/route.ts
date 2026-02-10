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

interface DocumentMeta {
  filename: string;
  folder: string;
  path: string;
  title: string;
  tags: string[];
  size: number;
  created_at: string;
  modified_at: string;
}

/**
 * Recursively scan the second-brain directory for markdown files.
 */
async function scanDocuments(dir: string, baseDir: string): Promise<DocumentMeta[]> {
  const docs: DocumentMeta[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subDocs = await scanDocuments(fullPath, baseDir);
        docs.push(...subDocs);
      } else if (entry.name.endsWith('.md')) {
        const stat = await fs.stat(fullPath);
        const relativePath = path.relative(baseDir, fullPath);
        const folder = path.dirname(relativePath);

        // Extract title from filename
        const title = entry.name
          .replace(/\.md$/, '')
          .replace(/[-_]/g, ' ')
          .replace(/^\d{4}-\d{2}-\d{2}\s*/, ''); // Remove date prefix for display

        // Derive tags from folder name and filename patterns
        const tags: string[] = [folder !== '.' ? folder : 'root'];
        if (entry.name.includes('journal')) tags.push('journal');
        if (entry.name.includes('research')) tags.push('research');
        if (entry.name.includes('review')) tags.push('business');
        if (folder === 'journals') tags.push('journal');
        if (folder === 'research') tags.push('research');
        if (folder === 'business') tags.push('business');
        if (folder === 'content-ideas') tags.push('content');
        if (folder === 'projects') tags.push('project');

        docs.push({
          filename: entry.name,
          folder,
          path: relativePath,
          title: title || entry.name,
          tags: [...new Set(tags)],
          size: stat.size,
          created_at: stat.birthtime.toISOString(),
          modified_at: stat.mtime.toISOString(),
        });
      }
    }
  } catch {
    // Directory might not exist yet
  }

  return docs;
}

/**
 * GET /api/second-brain/documents
 * List all documents with metadata.
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  try {
    const searchQuery = request.nextUrl.searchParams.get('q') || '';
    const tagFilter = request.nextUrl.searchParams.get('tag') || '';
    const folderFilter = request.nextUrl.searchParams.get('folder') || '';

    let docs = await scanDocuments(SECOND_BRAIN_ROOT, SECOND_BRAIN_ROOT);

    // Sort by modified date descending
    docs.sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    // Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      docs = docs.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.filename.toLowerCase().includes(q) ||
        d.folder.toLowerCase().includes(q)
      );
    }
    if (tagFilter) {
      docs = docs.filter(d => d.tags.includes(tagFilter));
    }
    if (folderFilter) {
      docs = docs.filter(d => d.folder === folderFilter);
    }

    return NextResponse.json({
      ok: true,
      documents: docs,
      total: docs.length,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Second brain scan error:`, error);
    return createApiErrorResponse('INTERNAL', 'Failed to scan documents', 500, correlationId);
  }
}

/**
 * POST /api/second-brain/documents
 * Create a new document.
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: { folder?: string; filename: string; content: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  if (!body.filename || !body.content) {
    return createApiErrorResponse('BAD_REQUEST', 'filename and content are required', 400, correlationId);
  }

  // Sanitize filename
  const sanitized = body.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const filename = sanitized.endsWith('.md') ? sanitized : `${sanitized}.md`;
  const folder = body.folder || 'journals';

  try {
    const dirPath = path.join(SECOND_BRAIN_ROOT, folder);
    await fs.mkdir(dirPath, { recursive: true });

    const filePath = path.join(dirPath, filename);
    await fs.writeFile(filePath, body.content, 'utf-8');

    return NextResponse.json({
      ok: true,
      document: {
        filename,
        folder,
        path: path.join(folder, filename),
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Document creation error:`, error);
    return createApiErrorResponse('INTERNAL', 'Failed to create document', 500, correlationId);
  }
}
