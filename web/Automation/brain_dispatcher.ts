/**
 * Brain Dispatcher — Obsidian Vault → Mission Control
 *
 * Scans Vault/Decisions/ for notes with `status: approved` and
 * no `mc_status`. Creates project_tasks in Supabase, writes back
 * mc_task_id + mc_status to the note, and appends to the project worklog.
 *
 * Idempotent: notes with mc_status set are always skipped.
 */
import { readdir, readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logTaskEvent } from '@/lib/command-center/ingest';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getVaultPath(): string {
  return (
    process.env.OBSIDIAN_VAULT_PATH ||
    "/Volumes/WorkSSD/Brandon's Second Brain/Brandons Second Brain"
  );
}

/** Vault project key → cc_projects.type */
const PROJECT_TYPE_MAP: Record<string, string> = {
  FlashFlow: 'flashflow',
  MMM: 'hhh',
  ZebbysWorld: 'zebby',
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
// Worklog append
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
    // Append row after the existing table separator for this day
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

  // Create new day section before the template comment
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
// Core dispatcher
// ---------------------------------------------------------------------------

export interface DispatchResult {
  file: string;
  taskId: string;
  title: string;
  project: string;
}

export interface BrainDispatchReport {
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

export async function runBrainDispatch(): Promise<BrainDispatchReport> {
  const dispatched: DispatchResult[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const vaultPath = getVaultPath();
  const decisionsDir = join(vaultPath, 'Vault', 'Decisions');

  // 1. Read decision files
  let files: string[];
  try {
    const entries = await readdir(decisionsDir);
    files = entries.filter((f) => f.endsWith('.md'));
  } catch {
    return { dispatched, skipped, errors: [`Cannot read ${decisionsDir}`] };
  }

  if (files.length === 0) {
    return { dispatched, skipped: ['No decision files found'], errors };
  }

  // 2. Build project ID lookup from cc_projects
  const { data: projects } = await supabaseAdmin
    .from('cc_projects')
    .select('id, name, type')
    .eq('status', 'active');

  const projectLookup = new Map<string, string>();
  for (const p of projects || []) {
    projectLookup.set(p.type, p.id);
    projectLookup.set(p.name.toLowerCase(), p.id);
  }

  // 3. Process each decision file
  for (const file of files) {
    const filePath = join(decisionsDir, file);
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (e) {
      errors.push(`${file}: read failed — ${e}`);
      continue;
    }

    const parsed = parseFrontmatter(content);
    if (!parsed) {
      skipped.push(`${file}: no frontmatter`);
      continue;
    }

    const { data } = parsed;

    // Gate: must be approved
    if (data.status !== 'approved') {
      skipped.push(`${file}: status=${data.status || 'missing'}`);
      continue;
    }

    // Gate: idempotency — skip if already dispatched
    if (data.mc_status) {
      skipped.push(`${file}: already dispatched (mc_status=${data.mc_status})`);
      continue;
    }

    // Resolve project ID
    const vaultProject = data.project || '';
    const ccType = PROJECT_TYPE_MAP[vaultProject];
    const projectId =
      projectLookup.get(ccType || '') ||
      projectLookup.get(vaultProject.toLowerCase());

    if (!projectId) {
      errors.push(`${file}: cannot resolve project "${vaultProject}"`);
      continue;
    }

    // Build task fields
    const title =
      data.summary ||
      file
        .replace(/\.md$/, '')
        .replace(/^\d{4}-\d{2}-\d{2}-/, '')
        .replace(/-/g, ' ');
    const priority = data.priority
      ? Math.min(5, Math.max(1, parseInt(data.priority, 10) || 3))
      : 3;
    const owner = data.owner || 'unassigned';

    // 4. Insert into project_tasks
    const { data: task, error: dbErr } = await supabaseAdmin
      .from('project_tasks')
      .insert({
        project_id: projectId,
        title,
        description: `Dispatched from vault decision: ${file}\n\nOwner: ${owner}`,
        assigned_agent: owner === 'brandon' ? 'unassigned' : owner,
        status: 'queued' as const,
        priority,
        meta: {
          source: 'brain-dispatcher',
          vault_file: file,
          vault_project: vaultProject,
        },
      })
      .select('id')
      .single();

    if (dbErr || !task) {
      errors.push(`${file}: DB insert failed — ${dbErr?.message}`);
      continue;
    }

    // Log creation event
    await logTaskEvent({
      task_id: task.id,
      agent_id: 'brain-dispatcher',
      event_type: 'created',
      payload: { source: 'obsidian-decision', vault_file: file },
    });

    // 5. Write mc_task_id and mc_status back to the note
    const today = new Date().toISOString().slice(0, 10);
    const updated = injectFrontmatterFields(content, {
      mc_task_id: task.id,
      mc_status: 'created',
      updated: today,
    });
    try {
      await writeFile(filePath, updated, 'utf-8');
    } catch (e) {
      errors.push(`${file}: writeback failed — ${e}`);
    }

    // 6. Append to project worklog
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
        errors.push(`${file}: worklog append failed — ${e}`);
      }
    }

    dispatched.push({
      file,
      taskId: task.id,
      title,
      project: vaultProject,
    });
  }

  return { dispatched, skipped, errors };
}
