/**
 * GitHub Decision Source — production-safe adapter
 *
 * Lists and fetches approved-decision markdown files from a GitHub repo
 * via the Contents API. Returns a normalized Decision[] array.
 *
 * Env vars:
 *   GITHUB_TOKEN              — fine-grained PAT (contents:read minimum)
 *   BRAIN_FEED_GITHUB_OWNER   — repo owner  (default: brandonglomski)
 *   BRAIN_FEED_GITHUB_REPO    — repo name   (default: brandons-second-brain-feed)
 *   BRAIN_FEED_GITHUB_PATH    — dir path    (default: Vault/Decisions)
 *
 * Design choices:
 *   - Every fetch uses cache: "no-store" so Vercel never serves stale data.
 *   - Content is fetched via download_url (raw.githubusercontent), not base64.
 *   - Pagination is handled for directories with >1000 files (Trees API fallback).
 *   - Non-200 responses throw with status + body excerpt for fast debugging.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Decision {
  /** Git blob SHA — stable identifier for this file revision */
  id: string;
  /** Filename without extension (e.g. "2026-02-25-launch-video-plan") */
  title: string;
  /** Raw markdown body of the file */
  body: string;
  /** Repo-relative path (e.g. "Vault/Decisions/2026-02-25-launch-video-plan.md") */
  path: string;
}

interface ContentsEntry {
  name: string;
  path: string;
  sha: string;
  type: string;
  download_url: string | null;
}

interface TreeEntry {
  path: string;
  sha: string;
  type: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] || fallback;
  if (!val) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val;
}

function getConfig() {
  return {
    token: requireEnv('GITHUB_TOKEN'),
    owner: requireEnv('BRAIN_FEED_GITHUB_OWNER', 'brandonglomski'),
    repo: requireEnv('BRAIN_FEED_GITHUB_REPO', 'brandons-second-brain-feed'),
    path: requireEnv('BRAIN_FEED_GITHUB_PATH', 'Vault/Decisions'),
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

const GH_API = 'https://api.github.com';

async function ghApi(token: string, endpoint: string): Promise<Response> {
  const res = await fetch(`${GH_API}${endpoint}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GitHub API ${res.status} on ${endpoint}: ${text.slice(0, 300)}`,
    );
  }
  return res;
}

async function fetchRaw(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Raw fetch ${res.status} on ${url}`);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// Directory listing (Contents API, with Trees API fallback for >1000 files)
// ---------------------------------------------------------------------------

async function listMarkdownEntries(
  token: string,
  owner: string,
  repo: string,
  dirPath: string,
): Promise<ContentsEntry[]> {
  // Contents API: works for directories with ≤1000 files
  const endpoint = `/repos/${owner}/${repo}/contents/${dirPath}`;
  try {
    const res = await ghApi(token, endpoint);
    const items = (await res.json()) as ContentsEntry[];

    // If GitHub returns an object instead of array, the path is a file not a dir
    if (!Array.isArray(items)) {
      throw new Error(`Path "${dirPath}" is not a directory`);
    }

    const mdFiles = items.filter(
      (i) => i.type === 'file' && i.name.endsWith('.md'),
    );

    // If we got exactly 1000 items, the list may be truncated → fall back to Trees API
    if (items.length < 1000) {
      return mdFiles;
    }
  } catch (e) {
    // If Contents API fails for any reason other than our own throw, try Trees
    if (e instanceof Error && e.message.startsWith('Path ')) throw e;
    console.warn('[github_decision_source] Contents API failed, trying Trees API:', e);
  }

  // Trees API fallback: returns all blobs in one call, no 1000-item cap
  const branchRes = await ghApi(
    token,
    `/repos/${owner}/${repo}/branches/main`,
  );
  const branch = (await branchRes.json()) as { commit: { sha: string } };
  const treeSha = branch.commit.sha;

  const treeRes = await ghApi(
    token,
    `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
  );
  const tree = (await treeRes.json()) as { tree: TreeEntry[] };

  const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
  return tree.tree
    .filter(
      (t) =>
        t.type === 'blob' &&
        t.path.startsWith(prefix) &&
        t.path.endsWith('.md') &&
        // Only direct children (no subdirectory nesting)
        !t.path.slice(prefix.length).includes('/'),
    )
    .map((t) => ({
      name: t.path.slice(prefix.length),
      path: t.path,
      sha: t.sha,
      type: 'file' as const,
      // Trees API doesn't give download_url; we'll construct it
      download_url: `https://raw.githubusercontent.com/${owner}/${repo}/main/${t.path}`,
    }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all markdown decision files from the configured GitHub repo path.
 * Returns a normalized Decision[] array.
 *
 * Throws on misconfiguration or GitHub API errors.
 */
export async function fetchDecisions(): Promise<Decision[]> {
  const { token, owner, repo, path } = getConfig();

  const entries = await listMarkdownEntries(token, owner, repo, path);

  if (entries.length === 0) {
    return [];
  }

  const decisions: Decision[] = [];

  for (const entry of entries) {
    const url =
      entry.download_url ||
      `https://raw.githubusercontent.com/${owner}/${repo}/main/${entry.path}`;

    let body: string;
    try {
      body = await fetchRaw(url);
    } catch (e) {
      // Fail loudly per spec — one bad file should not silently vanish
      throw new Error(
        `Failed to fetch decision "${entry.name}": ${e instanceof Error ? e.message : e}`,
      );
    }

    decisions.push({
      id: entry.sha,
      title: entry.name.replace(/\.md$/, ''),
      body,
      path: entry.path,
    });
  }

  return decisions;
}
