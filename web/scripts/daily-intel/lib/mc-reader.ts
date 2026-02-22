/**
 * Read documents from Mission Control.
 * Uses GET /api/documents for listing and GET /api/documents/:id for content.
 * Reuses same auth/URL patterns as mc-poster.ts.
 */

const MC_BASE_URL_DEFAULT = 'https://mc.flashflowai.com';

export interface MCDocument {
  id: string;
  title: string;
  content: string;
  category: string;
  lane: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

interface MCDocumentSummary {
  id: string;
  title: string;
  category: string;
  lane: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

function getMCBaseUrl(): string {
  return process.env.MC_BASE_URL || MC_BASE_URL_DEFAULT;
}

function getMCToken(): string | null {
  return process.env.MC_API_TOKEN
    || process.env.MISSION_CONTROL_TOKEN
    || process.env.MISSION_CONTROL_AGENT_TOKEN
    || null;
}

function getHeaders(): Record<string, string> {
  const token = getMCToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Query MC documents list (metadata only, no content).
 */
export async function queryMCDocuments(params: {
  category?: string;
  lane?: string;
  tag?: string;
  search?: string;
}): Promise<MCDocumentSummary[]> {
  const baseUrl = getMCBaseUrl();
  const url = new URL('/api/documents', baseUrl);
  if (params.category) url.searchParams.set('category', params.category);
  if (params.lane) url.searchParams.set('lane', params.lane);
  if (params.tag) url.searchParams.set('tag', params.tag);
  if (params.search) url.searchParams.set('search', params.search);

  const res = await fetch(url.toString(), { headers: getHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MC GET /api/documents failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Fetch a single document by ID (includes content).
 */
export async function getMCDocument(id: string): Promise<MCDocument> {
  const baseUrl = getMCBaseUrl();
  const res = await fetch(`${baseUrl}/api/documents/${id}`, { headers: getHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MC GET /api/documents/${id} failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Find today's intel document for a given lane.
 * Matches by lane + category "intelligence" + today's date in title.
 */
export async function getTodayIntelDoc(lane: string): Promise<MCDocument | null> {
  const today = new Date().toISOString().slice(0, 10);
  const docs = await queryMCDocuments({
    category: 'intelligence',
    lane,
    search: today,
  });

  const match = docs.find(d => d.title.includes(today));
  if (!match) return null;
  return getMCDocument(match.id);
}

/**
 * Get intel documents from the last N days for a lane.
 * Client-side date filter on title (expects YYYY-MM-DD in title).
 */
export async function getRecentIntelDocs(lane: string, days: number): Promise<MCDocument[]> {
  const docs = await queryMCDocuments({
    category: 'intelligence',
    lane,
  });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Filter to docs with a date in title that's within range
  const datePattern = /\d{4}-\d{2}-\d{2}/;
  const recent = docs.filter(d => {
    const match = d.title.match(datePattern);
    if (!match) return false;
    return match[0] >= cutoffStr;
  });

  // Fetch full content for each
  const full = await Promise.all(recent.map(d => getMCDocument(d.id)));
  return full;
}
