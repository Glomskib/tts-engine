/**
 * Nightly Idea Researcher job.
 *
 * Two phases:
 *   1. Research: Score ideas (inbox/new/queued), generate research artifacts
 *   2. File ingestion: Extract text from uploaded file artifacts (pdf, text, images)
 *
 * Called by:
 *   - POST /api/admin/command-center/run-nightly (manual trigger)
 *   - pnpm run job:nightly (CLI)
 *   - cron/scheduled function
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { recordAgentRunStart, recordAgentRunFinish } from './agent-runs';
import { saveIdeaArtifact } from './ingest';

export interface NightlyJobResult {
  processed: number;
  queued_runs: number;
  errors: number;
  artifacts_ingested: number;
  log: string[];
}

const DEFAULT_LIMIT = 10;

/**
 * Run the nightly idea research job.
 *
 * @param dryRun - if true, don't actually modify data (log only)
 * @param limit - max ideas to process (default 10)
 */
export async function runNightlyIdeaResearch(
  dryRun = false,
  limit = DEFAULT_LIMIT,
): Promise<NightlyJobResult> {
  const log: string[] = [];
  let processed = 0;
  let queuedRuns = 0;
  let errors = 0;

  log.push(`[nightly] Starting at ${new Date().toISOString()}, dryRun=${dryRun}, limit=${limit}`);

  // 1. Pull ideas that need processing
  //    Select by score (highest first), status in (inbox, new, queued)
  const { data: ideas, error: fetchError } = await supabaseAdmin
    .from('ideas')
    .select('*')
    .in('status', ['inbox', 'new', 'queued'])
    .order('score', { ascending: false, nullsFirst: false })
    .order('priority', { ascending: true })
    .limit(limit);

  if (fetchError) {
    log.push(`[nightly] ERROR fetching ideas: ${fetchError.message}`);
    return { processed: 0, queued_runs: 0, errors: 1, artifacts_ingested: 0, log };
  }

  if (!ideas || ideas.length === 0) {
    log.push('[nightly] No ideas to research.');
  } else {
    log.push(`[nightly] Found ${ideas.length} ideas to process.`);
  }

  // 2. Process each idea
  for (const idea of ideas ?? []) {
    try {
      log.push(`[nightly] Processing idea "${idea.title}" (${idea.id}) score=${idea.score ?? 'none'}`);

      if (dryRun) {
        log.push(`[nightly]   DRY RUN — would generate research_summary, set status=researched`);
        processed++;
        continue;
      }

      // Start research agent run (brett-growth)
      const researchRun = await recordAgentRunStart({
        agent_id: 'brett-growth',
        related_type: 'idea',
        related_id: idea.id,
        action: 'research',
        model_primary: 'claude-3.5-sonnet',
        metadata: { idea_title: idea.title, source: 'nightly_job' },
      });
      queuedRuns++;
      log.push(`[nightly]   Started research run ${researchRun.id}`);

      // Generate structured research_summary artifact
      const nextActions = determineNextActions(idea);
      const researchMd = generateResearchSummary(idea, nextActions);

      await saveIdeaArtifact({
        idea_id: idea.id,
        artifact_type: 'research',
        content_md: researchMd,
        meta: {
          generated_by: 'nightly_job',
          agent_run_id: researchRun.id,
          next_actions: nextActions,
        },
      });
      log.push(`[nightly]   Saved research_summary artifact`);

      // Finish research run with simulated token counts
      const estimatedTokensIn = Math.max(500, (idea.prompt?.length ?? 0) * 2);
      const estimatedTokensOut = researchMd.length * 2;
      await recordAgentRunFinish({
        run_id: researchRun.id,
        status: 'completed',
        tokens_in: estimatedTokensIn,
        tokens_out: estimatedTokensOut,
        model_used: 'claude-3.5-sonnet',
        metadata: { artifact_type: 'research_summary' },
      });

      // Start feasibility run (tom-dev) if mode includes build
      if (idea.mode === 'research_and_build' || idea.mode === 'research_and_plan') {
        const feasRun = await recordAgentRunStart({
          agent_id: 'tom-dev',
          related_type: 'idea',
          related_id: idea.id,
          action: 'build_feasibility',
          model_primary: 'claude-3.5-sonnet',
          metadata: { idea_title: idea.title, source: 'nightly_job' },
        });
        queuedRuns++;

        const feasMd = generateFeasibilityStub(idea);
        await saveIdeaArtifact({
          idea_id: idea.id,
          artifact_type: 'plan',
          content_md: feasMd,
          meta: { generated_by: 'nightly_job', agent_run_id: feasRun.id },
        });

        await recordAgentRunFinish({
          run_id: feasRun.id,
          status: 'completed',
          tokens_in: estimatedTokensIn,
          tokens_out: feasMd.length * 2,
          model_used: 'claude-3.5-sonnet',
          metadata: { artifact_type: 'feasibility' },
        });
        log.push(`[nightly]   Completed feasibility run ${feasRun.id}`);
      }

      // Update idea: status → researched, store next_action
      await supabaseAdmin
        .from('ideas')
        .update({
          status: 'researched',
          last_processed_at: new Date().toISOString(),
          meta: {
            ...(typeof idea.meta === 'object' && idea.meta !== null ? idea.meta : {}),
            next_action: nextActions[0] ?? 'review',
            last_nightly_run: new Date().toISOString(),
          },
        })
        .eq('id', idea.id);

      processed++;
      log.push(`[nightly]   Done — status set to researched, next_action=${nextActions[0] ?? 'review'}`);
    } catch (err) {
      errors++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.push(`[nightly]   ERROR processing idea ${idea.id}: ${errorMsg}`);

      try {
        await supabaseAdmin
          .from('ideas')
          .update({
            meta: { last_error: errorMsg, last_error_at: new Date().toISOString() },
          })
          .eq('id', idea.id);
      } catch {
        // Swallow nested error
      }
    }
  }

  // Phase 2: Ingest file artifacts (extract text from uploads)
  log.push(`[nightly] Phase 2: File artifact ingestion`);
  let artifactsIngested = 0;
  try {
    const ingestResult = await ingestFileArtifacts(dryRun);
    artifactsIngested = ingestResult.ingested;
    errors += ingestResult.errors;
    log.push(...ingestResult.log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`[nightly] ERROR in file ingestion phase: ${msg}`);
    errors++;
  }

  log.push(`[nightly] Complete. Processed=${processed}, QueuedRuns=${queuedRuns}, ArtifactsIngested=${artifactsIngested}, Errors=${errors}`);
  return { processed, queued_runs: queuedRuns, errors, artifacts_ingested: artifactsIngested, log };
}

// ── File Artifact Ingestion ──────────────────────────────────────

const BUCKET_NAME = 'cc-idea-artifacts';

interface IngestResult {
  ingested: number;
  errors: number;
  log: string[];
}

/**
 * Process uploaded file artifacts that don't have extracted_text yet.
 * - text/*: download and store content as extracted_text
 * - application/pdf: extract text with pdf-parse
 * - image/*: store placeholder extracted_text
 * Then generates a summary artifact for the parent idea.
 */
async function ingestFileArtifacts(dryRun = false): Promise<IngestResult> {
  const log: string[] = [];
  let ingested = 0;
  let errors = 0;

  // Find file artifacts without extracted_text
  const { data: pending, error: fetchErr } = await supabaseAdmin
    .from('idea_artifacts')
    .select('id, idea_id, label, storage_path, content_type, meta')
    .eq('artifact_type', 'file')
    .is('extracted_text', null)
    .limit(50);

  if (fetchErr) {
    log.push(`[ingest] ERROR fetching pending artifacts: ${fetchErr.message}`);
    return { ingested: 0, errors: 1, log };
  }

  if (!pending || pending.length === 0) {
    log.push('[ingest] No pending file artifacts to process.');
    return { ingested: 0, errors: 0, log };
  }

  log.push(`[ingest] Found ${pending.length} pending file artifacts.`);

  // Start an agent run for this ingestion batch
  const run = await recordAgentRunStart({
    agent_id: 'system',
    related_type: 'batch',
    action: 'file_artifact_ingestion',
    metadata: { source: 'nightly_job', count: pending.length },
  });

  for (const artifact of pending) {
    try {
      const contentType = artifact.content_type || '';
      const label = artifact.label || 'unknown';
      log.push(`[ingest] Processing "${label}" (${contentType})`);

      if (dryRun) {
        log.push(`[ingest]   DRY RUN — would extract text`);
        ingested++;
        continue;
      }

      let extractedText = '';
      let summary = '';

      if (contentType.startsWith('text/') || ['txt', 'md', 'csv', 'log'].some(ext => label.toLowerCase().endsWith(`.${ext}`))) {
        // Text file: download and store content
        extractedText = await downloadTextFromStorage(artifact.storage_path);
        if (extractedText.length > 100_000) {
          extractedText = extractedText.substring(0, 100_000) + '\n\n[truncated at 100K chars]';
        }
        summary = `Text file "${label}" (${extractedText.length} chars). ` +
          `First 200 chars: ${extractedText.substring(0, 200).replace(/\n/g, ' ')}`;
      } else if (contentType === 'application/pdf') {
        // PDF: extract text with pdf-parse
        extractedText = await extractPdfText(artifact.storage_path);
        if (extractedText.length > 100_000) {
          extractedText = extractedText.substring(0, 100_000) + '\n\n[truncated at 100K chars]';
        }
        summary = `PDF "${label}" (${extractedText.length} chars). ` +
          `First 200 chars: ${extractedText.substring(0, 200).replace(/\n/g, ' ')}`;
      } else if (contentType.startsWith('image/')) {
        // Image: placeholder (captioning can be added later)
        extractedText = `[image] ${label}`;
        summary = '';
      } else {
        extractedText = `[unsupported type: ${contentType}] ${label}`;
        summary = '';
      }

      // Update the artifact with extracted text and summary
      const { error: updateErr } = await supabaseAdmin
        .from('idea_artifacts')
        .update({
          extracted_text: extractedText,
          summary: summary || null,
        })
        .eq('id', artifact.id);

      if (updateErr) {
        throw new Error(`DB update failed: ${updateErr.message}`);
      }

      // Create an analysis artifact for the idea if we have meaningful text
      if (extractedText.length > 50 && !contentType.startsWith('image/')) {
        await saveIdeaArtifact({
          idea_id: artifact.idea_id,
          artifact_type: 'analysis',
          content_md: generateFileAnalysisMd(label, contentType, extractedText, summary),
          meta: {
            generated_by: 'nightly_job',
            source_artifact_id: artifact.id,
            agent_run_id: run.id,
          },
        });
      }

      ingested++;
      log.push(`[ingest]   Done — extracted ${extractedText.length} chars`);
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      log.push(`[ingest]   ERROR processing artifact ${artifact.id}: ${msg}`);

      // Mark as processed with error so we don't retry endlessly
      try {
        await supabaseAdmin
          .from('idea_artifacts')
          .update({
            extracted_text: `[extraction error] ${msg}`,
            meta: {
              ...(typeof artifact.meta === 'object' && artifact.meta !== null ? artifact.meta : {}),
              extraction_error: msg,
              extraction_error_at: new Date().toISOString(),
            },
          })
          .eq('id', artifact.id);
      } catch {
        // Swallow nested error
      }
    }
  }

  await recordAgentRunFinish({
    run_id: run.id,
    status: errors > 0 && ingested === 0 ? 'failed' : 'completed',
    metadata: { ingested, errors },
  });

  log.push(`[ingest] Complete. Ingested=${ingested}, Errors=${errors}`);
  return { ingested, errors, log };
}

async function downloadTextFromStorage(storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) throw new Error(`Storage download failed: ${error.message}`);
  if (!data) throw new Error('Empty file');

  return await data.text();
}

async function extractPdfText(storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) throw new Error(`Storage download failed: ${error.message}`);
  if (!data) throw new Error('Empty file');

  const buffer = Buffer.from(await data.arrayBuffer());

  // Dynamic import to avoid bundling issues
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function generateFileAnalysisMd(label: string, contentType: string, extractedText: string, summary: string): string {
  const now = new Date().toISOString().slice(0, 10);
  const preview = extractedText.substring(0, 500).replace(/\n{3,}/g, '\n\n');

  return `# File Analysis: ${label}

**Date:** ${now}
**Type:** ${contentType}
**Extracted Length:** ${extractedText.length} chars

## Summary
${summary || '_No summary available._'}

## Content Preview
\`\`\`
${preview}${extractedText.length > 500 ? '\n...(truncated)' : ''}
\`\`\`

---
*Auto-extracted by nightly file ingestion job on ${now}.*
`;
}

// ── Helpers ──────────────────────────────────────────────────────

interface IdeaRow {
  id: string;
  title: string;
  prompt: string;
  tags: string[];
  mode: string;
  priority: number;
  score: number | null;
  meta: Record<string, unknown> | null;
}

/**
 * Deterministic next_action logic:
 *  - create_task  → low/med risk + clear next steps (score >= 7, not research_only)
 *  - needs_human_decision → ambiguous or high risk (score 4-6.99 or high-risk tags)
 *  - kill → low value or not feasible (score < 4 or priority >= 4)
 */
function determineNextActions(idea: IdeaRow): string[] {
  const score = idea.score ?? 0;
  const highRisk = (idea.tags ?? []).some((t) =>
    ['compliance', 'legal', 'security'].includes(t.toLowerCase())
  );

  // kill: low value
  if (score < 4 || idea.priority >= 4) {
    return ['kill'];
  }

  // needs_human_decision: ambiguous or high risk
  if (highRisk || score < 7 || idea.mode === 'research_only') {
    return ['needs_human_decision'];
  }

  // create_task: clear path forward
  return ['create_task'];
}

function generateResearchSummary(idea: IdeaRow, nextActions: string[]): string {
  const score = idea.score ?? 0;
  const tagStr = (idea.tags ?? []).join(', ') || 'none';
  const now = new Date().toISOString().slice(0, 10);

  return `# Research Summary: ${idea.title}

**Date:** ${now}
**Score:** ${score}/10
**Mode:** ${idea.mode}
**Priority:** ${idea.priority}
**Tags:** ${tagStr}

## Prompt
${idea.prompt || '_No prompt provided._'}

## Analysis

### Opportunity Assessment
- **Score Rating:** ${score >= 8 ? 'High potential' : score >= 5 ? 'Moderate potential' : 'Low priority'}
- **Complexity Estimate:** ${idea.mode === 'research_and_build' ? 'Medium-High (requires build)' : idea.mode === 'research_and_plan' ? 'Medium (needs planning)' : 'Low (research only)'}
- **Time Horizon:** ${score >= 8 ? '1-2 weeks' : score >= 5 ? '2-4 weeks' : 'Backlog'}

### Key Considerations
- Related to: ${tagStr}
- Priority level: ${idea.priority} (1=highest, 5=lowest)
- ${nextActions[0] === 'create_task' ? 'Ready for task creation — clear path forward.' : nextActions[0] === 'needs_human_decision' ? 'Needs human review before proceeding.' : 'Low value — recommend killing.'}

## Next Actions
${nextActions.map((a, i) => `${i + 1}. **${a.replace(/_/g, ' ')}**`).join('\n')}

---
*Generated by nightly research job on ${now}.*
`;
}

function generateFeasibilityStub(idea: IdeaRow): string {
  const now = new Date().toISOString().slice(0, 10);

  return `# Feasibility Assessment: ${idea.title}

**Date:** ${now}
**Agent:** tom-dev
**Mode:** ${idea.mode}

## Technical Feasibility
- **Estimated effort:** ${idea.mode === 'research_and_build' ? '3-5 days' : '1-2 days'}
- **Dependencies:** To be determined after deeper research
- **Risk:** ${idea.priority <= 2 ? 'Low — straightforward integration' : 'Medium — needs architectural review'}

## Implementation Notes
- Pending deeper technical analysis
- Will need to assess existing codebase for integration points
- ${idea.tags?.includes('ai') ? 'LLM integration required — account for token costs' : 'Standard development work'}

## Recommendation
${idea.mode === 'research_and_build' ? 'Proceed to task creation after review.' : 'Complete research phase first, then reassess.'}

---
*Generated by nightly research job on ${now}.*
`;
}
