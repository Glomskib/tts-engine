/**
 * Brain Feed — GitHub Contents API adapter
 *
 * Reads/writes markdown decision files from a GitHub repo,
 * replacing the local-filesystem Obsidian vault dependency
 * so the brain dispatcher can run on Vercel.
 *
 * Required env vars:
 *   GITHUB_TOKEN                 — fine-grained PAT (contents read/write)
 *   BRAIN_FEED_GITHUB_OWNER      — repo owner (default: brandonglomski)
 *   BRAIN_FEED_GITHUB_REPO       — repo name  (default: brandons-second-brain-feed)
 *   BRAIN_FEED_GITHUB_BRANCH     — branch     (default: main)
 *   BRAIN_FEED_GITHUB_PATH       — directory   (default: Vault/Decisions)
 *   BRAIN_FEED_WRITEBACK          — "true"/"false" (default: true)
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GitHubFeedConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  /** Directory path inside the repo (no leading/trailing slash) */
  decisionsPath: string;
  /** Whether to write back mc_task_id / mc_status to the file */
  writeback: boolean;
}

export function getGitHubFeedConfig(): GitHubFeedConfig | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  return {
    token,
    owner: process.env.BRAIN_FEED_GITHUB_OWNER || 'brandonglomski',
    repo: process.env.BRAIN_FEED_GITHUB_REPO || 'brandons-second-brain-feed',
    branch: process.env.BRAIN_FEED_GITHUB_BRANCH || 'main',
    decisionsPath: process.env.BRAIN_FEED_GITHUB_PATH || 'Vault/Decisions',
    writeback: process.env.BRAIN_FEED_WRITEBACK !== 'false',
  };
}

export function isGitHubFeedConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubFileEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
}

export interface GitHubFileContent {
  content: string;
  sha: string;
  path: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.github.com';

async function ghFetch(
  cfg: GitHubFeedConfig,
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  return res;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List markdown files under the configured decisions directory.
 */
export async function listDecisionFiles(
  cfg: GitHubFeedConfig,
): Promise<GitHubFileEntry[]> {
  const res = await ghFetch(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.decisionsPath.split('/').map(encodeURIComponent).join('/')}?ref=${cfg.branch}`,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub list failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const items = (await res.json()) as Array<{
    name: string;
    path: string;
    sha: string;
    type: string;
  }>;

  return items
    .filter((i) => i.type === 'file')
    .map((i) => ({
      name: i.name,
      path: i.path,
      sha: i.sha,
      type: i.type as 'file',
    }));
}

/**
 * Fetch a single file's content (decoded from base64) and its SHA.
 */
export async function fetchFile(
  cfg: GitHubFeedConfig,
  path: string,
): Promise<GitHubFileContent> {
  const res = await ghFetch(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${cfg.branch}`,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub fetch failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content: string;
    sha: string;
    path: string;
    encoding: string;
  };

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, sha: data.sha, path: data.path };
}

/**
 * Update (or create) a file in the repo via the GitHub Contents API.
 * Requires the current file SHA for updates.
 */
export async function updateFile(
  cfg: GitHubFeedConfig,
  path: string,
  newContent: string,
  sha: string,
  commitMessage: string,
): Promise<{ sha: string }> {
  const body = JSON.stringify({
    message: commitMessage,
    content: Buffer.from(newContent, 'utf-8').toString('base64'),
    sha,
    branch: cfg.branch,
  });

  const res = await ghFetch(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
    { method: 'PUT', body },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub update failed (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content: { sha: string } };
  return { sha: data.content.sha };
}
