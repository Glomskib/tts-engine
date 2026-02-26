/**
 * Brain Dispatcher — Decisions → Mission Control
 *
 * Source adapter pattern:
 *   - Local:  reads Obsidian vault on filesystem (dev / local Mac)
 *   - GitHub: reads repo via Contents API   (Vercel production)
 *
 * Scans Vault/Decisions/ for notes with `status: approved` and
 * no `mc_status`. Creates project_tasks in Supabase, writes back
 * mc_task_id + mc_status to the note (local fs or GitHub commit).
 *
 * Idempotent: notes with mc_status set are always skipped.
 */
import { readdir, readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logTaskEvent } from '@/lib/command-center/ingest';
import {
  getGitHubFeedConfig,
  isGitHubFeedConfigured,
  listDecisionFiles,
  fetchFile,
  updateFile,
  type GitHubFeedConfig,
} from '@/lib/brain-feed/github';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getVaultPath(): string {
  return (
    process.env.OBSIDIAN_VAULT_PATH ||
    "/Volumes/WorkSSD/Brandon's Second Brain/Brandons Second Brain"
  );
}

/** Vault project key → canonical cc_projects.name */
const VAULT_TO_PROJECT_NAME: Record<string, string> = {
  FlashFlow: 'FlashFlow',
  MMM: 'MMM',
  ZebbysWorld: "Zebby's World",
};

/** Vault project key → relative worklog path inside vault */
const WORKLOG_REL: Record<string, string> = {
  FlashFlow: 'FlashFlow/_Ops/Worklog.md',
  MMM: 'MMM/_Ops/Worklog.md',
  ZebbysWorld: "Zebby's World/_Ops/Worklog.md",
};

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

export interface Frontmatter {
  [key: string]: string;
}

export function parseFrontmatter(
  content: string,
): { data: Frontmatter; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const data: Frontmatter = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) data[key] = val;
  }
  const body = content.slice(match[0].length).replace(/^\r?\n/, '');
  return { data, body };
}

export function injectFrontmatterFields(
  content: string,
  updates: Record<string, string>,
): string {
  const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!match) return content;
  let fm = match[2];
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}:.*$`, 'm');
    if (re.test(fm)) {
      fm = fm.replace(re, `${key}: ${value}`);
    } else {
      fm += `\n${key}: ${value}`;
    }
  }
  return `${match[1]}${fm}${match[3]}${content.slice(match[0].length)}`;
}

// ---------------------------------------------------------------------------
// Worklog append (local filesystem only)
// ---------------------------------------------------------------------------

export async function appendWorklogEntry(
  worklogPath: string,
  date: string,
  shipped: string,
  proof: string,
  blockers = '—',
  next = 'Monitor in MC',
): Promise<void> {
  const wl = await readFile(worklogPath, 'utf-8');
  const row = `| ${date} | ${shipped} | ${proof} | ${blockers} | ${next} |\n`;
  const dateHeader = `## ${date}`;

  if (wl.includes(dateHeader)) {
    const headerIdx = wl.indexOf(dateHeader);
    const sepIdx = wl.indexOf('|---', headerIdx);
    if (sepIdx !== -1) {
      const lineEnd = wl.indexOf('\n', sepIdx);
      const insertAt = lineEnd + 1;
      await writeFile(
        worklogPath,
        wl.slice(0, insertAt) + row + wl.slice(insertAt),
        'utf-8',
      );
      return;
    }
  }

  const newSection = `## ${date}\n\n| Date | What Shipped | Proof | Blockers | Next |\n|------|-------------|-------|----------|------|\n${row}\n---\n\n`;
  const marker = '<!-- New day template:';
  if (wl.includes(marker)) {
    const pos = wl.indexOf(marker);
    await writeFile(
      worklogPath,
      wl.slice(0, pos) + newSection + wl.slice(pos),
      'utf-8',
    );
  } else {
    await writeFile(worklogPath, wl + '\n' + newSection, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DispatchResult {
  file: string;
  taskId: string;
  title: string;
  project: string;
}

export interface BrainDispatchReport {
  source: 'local' | 'github';
  dispatched: DispatchResult[];
  skipped: string[];
  errors: string[];
}

export async function vaultAccessible(): Promise<boolean> {
  try {
    await access(getVaultPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine the best available source.
 *
 * Production (Vercel): GitHub first — vault is never mounted.
 * Dev (local):         vault first  — faster, no API calls.
 *
 * Detection: if GITHUB_TOKEN is set AND any BRAIN_FEED_GITHUB_* var
 * is present, treat GitHub as the primary source (production mode).
 */
export async function resolveSource(): Promise<'local' | 'github' | null> {
  const ghConfigured = isGitHubFeedConfigured();
  const hasBrainFeedEnv = !!(
    process.env.BRAIN_FEED_GITHUB_OWNER ||
    process.env.BRAIN_FEED_GITHUB_REPO ||
    process.env.BRAIN_FEED_GITHUB_PATH
  );

  // Production: GitHub is primary when explicitly configured
  if (ghConfigured && hasBrainFeedEnv) {
    return 'github';
  }

  // Dev: prefer local vault when available
  if (await vaultAccessible()) return 'local';

  // Fallback: GitHub with just GITHUB_TOKEN (no BRAIN_FEED_* overrides)
  if (ghConfigured) return 'github';

  return null;
}

// ---------------------------------------------------------------------------
// Shared dispatch logic (operates on filename + content pairs)
// ---------------------------------------------------------------------------

interface DecisionFile {
  name: string;
  /** Full path (local fs path or GitHub repo path) */
  path: string;
  content: string;
  /** GitHub blob SHA — only present for GitHub source */
  sha?: string;
}

interface WritebackFn {
  (file: DecisionFile, updatedContent: string, taskId: string): Promise<void>;
}

async function dispatchDecisions(
  files: DecisionFile[],
  writeback: WritebackFn,
  source: 'local' | 'github',
  vaultPath?: string,
): Promise<BrainDispatchReport> {
  const dispatched: DispatchResult[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  if (files.length === 0) {
    return { source, dispatched, skipped: ['No decision files found'], errors };
  }

  // Build project ID lookup (name-based, case-insensitive)
  const { data: projects } = await supabaseAdmin
    .from('cc_projects')
    .select('id, name, type')
    .eq('status', 'active');

  const projectLookup = new Map<string, string>();
  for (const p of projects || []) {
    projectLookup.set(p.name.toLowerCase(), p.id);
    // Legacy type key as fallback
    projectLookup.set(p.type, p.id);
  }

  for (const file of files) {
    const parsed = parseFrontmatter(file.content);
    if (!parsed) {
      skipped.push(`${file.name}: no frontmatter`);
      continue;
    }

    const { data } = parsed;

    // Gate: must be type=decision (if present) and status=approved
    if (data.type && data.type !== 'decision') {
      skipped.push(`${file.name}: type=${data.type}`);
      continue;
    }
    if (data.status !== 'approved') {
      skipped.push(`${file.name}: status=${data.status || 'missing'}`);
      continue;
    }

    // Gate: idempotency — skip if already dispatched
    if (data.mc_status && data.mc_status !== '') {
      skipped.push(`${file.name}: already dispatched (mc_status=${data.mc_status})`);
      continue;
    }

    // Resolve project ID by canonical name, then fallback to vault key
    const vaultProject = data.project || '';
    const canonicalName = VAULT_TO_PROJECT_NAME[vaultProject];
    const projectId =
      projectLookup.get((canonicalName || '').toLowerCase()) ||
      projectLookup.get(vaultProject.toLowerCase());

    if (!projectId) {
      errors.push(`${file.name}: cannot resolve project "${vaultProject}"`);
      continue;
    }

    // Build task fields
    const title =
      data.summary ||
      file.name
        .replace(/\.md$/, '')
        .replace(/^\d{4}-\d{2}-\d{2}-/, '')
        .replace(/-/g, ' ');
    const priority = data.priority
      ? Math.min(5, Math.max(1, parseInt(data.priority, 10) || 3))
      : 3;
    const owner = data.owner || 'unassigned';

    // Insert into project_tasks
    const { data: task, error: dbErr } = await supabaseAdmin
      .from('project_tasks')
      .insert({
        project_id: projectId,
        title,
        description: `Dispatched from ${source} decision: ${file.name}\n\nOwner: ${owner}`,
        assigned_agent: owner === 'brandon' ? 'unassigned' : owner,
        status: 'queued' as const,
        priority,
        meta: {
          source: 'brain-dispatcher',
          source_type: source,
          vault_file: file.name,
          vault_project: vaultProject,
          github_path: source === 'github' ? file.path : undefined,
        },
      })
      .select('id')
      .single();

    if (dbErr || !task) {
      errors.push(`${file.name}: DB insert failed — ${dbErr?.message}`);
      continue;
    }

    // Log creation event
    await logTaskEvent({
      task_id: task.id,
      agent_id: 'brain-dispatcher',
      event_type: 'created',
      payload: { source: `${source}-decision`, vault_file: file.name },
    });

    // Write mc_task_id and mc_status back to the note
    const today = new Date().toISOString().slice(0, 10);
    const updated = injectFrontmatterFields(file.content, {
      mc_task_id: task.id,
      mc_status: 'created',
      updated: today,
    });

    try {
      await writeback(file, updated, task.id);
    } catch (e) {
      errors.push(`${file.name}: writeback failed — ${e}`);
    }

    // Append to project worklog (local only)
    if (source === 'local' && vaultPath) {
      const worklogRel = WORKLOG_REL[vaultProject];
      if (worklogRel) {
        try {
          await appendWorklogEntry(
            join(vaultPath, worklogRel),
            today,
            `Decision dispatched → MC: ${title}`,
            `mc-task: ${task.id.slice(0, 8)}`,
          );
        } catch (e) {
          errors.push(`${file.name}: worklog append failed — ${e}`);
        }
      }
    }

    dispatched.push({
      file: file.name,
      taskId: task.id,
      title,
      project: vaultProject,
    });
  }

  return { source, dispatched, skipped, errors };
}

// ---------------------------------------------------------------------------
// Local source adapter
// ---------------------------------------------------------------------------

async function runLocalDispatch(): Promise<BrainDispatchReport> {
  const vaultPath = getVaultPath();
  const decisionsDir = join(vaultPath, 'Vault', 'Decisions');

  let fileNames: string[];
  try {
    const entries = await readdir(decisionsDir);
    fileNames = entries.filter((f) => f.endsWith('.md'));
  } catch {
    return {
      source: 'local',
      dispatched: [],
      skipped: [],
      errors: [`Cannot read ${decisionsDir}`],
    };
  }

  // Load file contents
  const files: DecisionFile[] = [];
  const readErrors: string[] = [];
  for (const name of fileNames) {
    const filePath = join(decisionsDir, name);
    try {
      const content = await readFile(filePath, 'utf-8');
      files.push({ name, path: filePath, content });
    } catch (e) {
      readErrors.push(`${name}: read failed — ${e}`);
    }
  }

  const writeback: WritebackFn = async (file, updatedContent) => {
    await writeFile(file.path, updatedContent, 'utf-8');
  };

  const report = await dispatchDecisions(files, writeback, 'local', vaultPath);
  report.errors.push(...readErrors);
  return report;
}

// ---------------------------------------------------------------------------
// GitHub source adapter
// ---------------------------------------------------------------------------

async function runGitHubDispatch(): Promise<BrainDispatchReport> {
  const cfg = getGitHubFeedConfig();
  if (!cfg) {
    return {
      source: 'github',
      dispatched: [],
      skipped: [],
      errors: ['GitHub feed not configured (GITHUB_TOKEN missing)'],
    };
  }

  // List decision files from repo
  let entries: Awaited<ReturnType<typeof listDecisionFiles>>;
  try {
    entries = await listDecisionFiles(cfg);
  } catch (e) {
    return {
      source: 'github',
      dispatched: [],
      skipped: [],
      errors: [`GitHub list failed: ${e}`],
    };
  }

  // Fetch each file's content
  const files: DecisionFile[] = [];
  const readErrors: string[] = [];
  for (const entry of entries) {
    try {
      const fetched = await fetchFile(cfg, entry.path);
      files.push({
        name: entry.name,
        path: fetched.path,
        content: fetched.content,
        sha: fetched.sha,
      });
    } catch (e) {
      readErrors.push(`${entry.name}: GitHub fetch failed — ${e}`);
    }
  }

  const writeback: WritebackFn = async (file, updatedContent, taskId) => {
    if (!cfg.writeback) return;
    if (!file.sha) {
      throw new Error('No SHA for writeback');
    }
    await updateFile(
      cfg,
      file.path,
      updatedContent,
      file.sha,
      `[brain-dispatch] mc_task_id=${taskId.slice(0, 8)}`,
    );
  };

  const report = await dispatchDecisions(files, writeback, 'github');
  report.errors.push(...readErrors);
  return report;
}

// ---------------------------------------------------------------------------
// Public API — main entry point
// ---------------------------------------------------------------------------

/**
 * Run brain dispatch from the best available source.
 * Orchestrator + cron routes call this.
 */
export async function runBrainDispatch(): Promise<BrainDispatchReport> {
  const source = await resolveSource();

  if (!source) {
    return {
      source: 'local',
      dispatched: [],
      skipped: ['No source available (no vault, no GitHub token)'],
      errors: [],
    };
  }

  const report = source === 'local'
    ? await runLocalDispatch()
    : await runGitHubDispatch();

  // Heartbeat: record run in ff_cron_runs (non-blocking)
  const decisionsLoaded =
    report.dispatched.length + report.skipped.length + report.errors.length;
  try {
    await supabaseAdmin.from('ff_cron_runs').insert({
      job: `brain-dispatch-${source}`,
      status: report.errors.length === 0 ? 'ok' : 'error',
      finished_at: new Date().toISOString(),
      error: report.errors.length > 0 ? report.errors.join('; ') : null,
      meta: {
        source,
        decisions_loaded: decisionsLoaded,
        decisions_processed: report.dispatched.length + report.skipped.length,
        tasks_created: report.dispatched.length,
        scanned_count: decisionsLoaded,
        dispatched_count: report.dispatched.length,
        skipped_count: report.skipped.length,
      },
    });
    console.log(`[brain-dispatcher] Heartbeat recorded (${source})`);
  } catch (e) {
    console.warn('[brain-dispatcher] Heartbeat insert failed:', e);
  }

  return report;
}
