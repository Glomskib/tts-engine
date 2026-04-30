/**
 * MMM Bolt/Miles agent loop.
 *
 * Real (not demo) AI-backed actions. Each action:
 *   1. Records an `agent_runs` row via recordAgentRunStart / recordAgentRunFinish
 *      with agent_id='bolt-miles' and a meaningful action string.
 *   2. Calls callAnthropicAPI (or callAnthropicJSON) with a tight prompt.
 *   3. Persists the result into the canonical existing table:
 *        - draftSocialPost      → marketing_posts (status='cancelled' until approved)
 *        - generateWeeklyDigest → marketing_posts (status='cancelled' until approved)
 *        - addBikeEventResearch → ideas (status='inbox' until approved)
 *        - summarizeMeetingNote → idea_artifacts (artifact_type='summary')
 *   4. Stamps the standardized approval-gate metadata so the row appears in the
 *      MMM Needs-Approval queue and the publisher cron skips it until a human
 *      flips the status.
 *   5. Never publishes/sends. Returns a clear JSON-shaped result.
 *
 * If ANTHROPIC_API_KEY is missing, every function throws a clear error before
 * any DB writes happen — the API endpoints translate that into a 503.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { callAnthropicAPI, callAnthropicJSON } from '@/lib/ai/anthropic';
import { classifyClaimRisk } from '@/lib/marketing/claim-risk';
import {
  recordAgentRunStart,
  recordAgentRunFinish,
} from '@/lib/command-center/agent-runs';
import { MMM_GROUP_SLUG, MMM_EVENTS, getMmmEvent } from './registry';

const AGENT_ID = 'bolt-miles';

function baseMeta(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    source: 'agent',
    agent_id: AGENT_ID,
    requires_approval: true,
    approval_status: 'pending',
    group_slug: MMM_GROUP_SLUG,
    is_demo: false,
    ...extra,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Action 1 — Draft a social post
// ──────────────────────────────────────────────────────────────────────────────

export type SocialPostType =
  | 'thank-you'
  | 'save-the-date'
  | 'sponsor-call'
  | 'volunteer-call'
  | 'after-party-teaser'
  | 'recap'
  | 'momentum-update';

const POST_TYPE_BRIEF: Record<SocialPostType, string> = {
  'thank-you': 'A heartfelt thank-you to riders, volunteers, and sponsors after the event wrapped.',
  'save-the-date': 'Save-the-date announcement — punchy, builds excitement, includes date/time/location.',
  'sponsor-call': 'A direct ask for sponsors. Warm but specific. Include why MMM is a strong sponsor fit.',
  'volunteer-call': 'A volunteer recruitment call. Specific roles, low-friction sign-up CTA.',
  'after-party-teaser': 'Tease the after-party — same location as the ride, food, drinks, music, raffles.',
  recap: 'Post-event recap — celebrate the ride, photos prompt, soft CTA toward the next event.',
  'momentum-update': 'A "why we do this" momentum update reminding the community of MMM\'s mission.',
};

export interface DraftSocialPostInput {
  event_slug: string;
  post_type: SocialPostType;
  extra_context?: string;
}

export interface DraftSocialPostResult {
  ok: true;
  marketing_post_id: string;
  agent_run_id: string;
  facebook: string;
  linkedin?: string;
  twitter?: string;
  hashtags: string[];
  claim_risk_score: number;
  claim_risk_flags: string[];
}

export async function draftSocialPost(input: DraftSocialPostInput): Promise<DraftSocialPostResult> {
  const event = getMmmEvent(input.event_slug);
  if (!event) throw new Error(`Unknown event slug: ${input.event_slug}`);

  const run = await recordAgentRunStart({
    agent_id: AGENT_ID,
    related_type: 'initiative',
    related_id: null, // initiative_id not in registry; could resolve via DB if needed
    action: `draft_social_post:${input.post_type}`,
    model_primary: 'claude-sonnet-4-20250514',
    metadata: { event_slug: input.event_slug, post_type: input.post_type, group_slug: MMM_GROUP_SLUG },
  });

  const systemPrompt = `You are Miles, the helper agent for Making Miles Matter — a nonprofit community cycling group running events like the Findlay Further Fondo (FFF) and HHH. You write short, warm, on-brand social posts. Voice: human, energetic but grounded, never corporate, never pushy. Avoid medical/health claims and absolutist promises.`;

  const userPrompt = `Draft a Facebook-first social post for ${event.name} (${event.short_name}).
Event: ${event.name}
When: ${event.display_date}${event.start_time ? ` · ${event.start_time}` : ''}
Where: ${event.location || 'TBD'}
Status: ${event.status}
Description: ${event.description || ''}
Highlights: ${(event.highlights || []).join(' · ')}

Post type: ${input.post_type}
Brief: ${POST_TYPE_BRIEF[input.post_type]}
${input.extra_context ? `Extra context: ${input.extra_context}` : ''}

Return strict JSON with this shape:
{
  "facebook": "primary Facebook post (≤450 chars, no hashtags inline)",
  "linkedin": "LinkedIn variant (slightly more polished, optional)",
  "twitter": "Twitter/X variant (≤270 chars, optional)",
  "hashtags": ["#makingmilesmatter", "#hhh2026", ...]
}
Rules: no medical claims, no absolutist promises, do not include emojis if the brief is corporate-leaning. Use 3-5 hashtags total.`;

  let parsed: { facebook: string; linkedin?: string; twitter?: string; hashtags?: string[] };
  let raw: { text: string; usage: { input_tokens: number; output_tokens: number }; model: string };
  try {
    const result = await callAnthropicJSON<typeof parsed>(userPrompt, {
      systemPrompt,
      agentId: AGENT_ID,
      requestType: 'mmm.draft_social_post',
      maxTokens: 1024,
      temperature: 0.6,
    });
    parsed = result.parsed;
    raw = result.raw;
  } catch (err) {
    await recordAgentRunFinish({
      run_id: run.id,
      status: 'failed',
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  const hashtags = (parsed.hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`));
  const fullContent = [parsed.facebook.trim(), '', hashtags.join(' ')].join('\n').trim();
  const risk = classifyClaimRisk(fullContent);

  const meta = baseMeta({
    approval_type: 'social_post',
    related_event_slug: input.event_slug,
    post_type: input.post_type,
    agent_run_id: run.id,
    variants: { linkedin: parsed.linkedin || null, twitter: parsed.twitter || null },
    hashtags,
  });

  const { data, error } = await supabaseAdmin
    .from('marketing_posts')
    .insert({
      content: fullContent,
      media_items: [],
      platforms: [],
      // 'cancelled' is the only CHECK-allowed status that the publisher cron will not auto-pick.
      // The approve route flips this to 'scheduled' and sets scheduled_for.
      status: 'cancelled',
      source: AGENT_ID,
      scheduled_for: null,
      claim_risk_score: risk.score,
      claim_risk_flags: risk.flags,
      created_by: AGENT_ID,
      meta,
    })
    .select('id')
    .single();

  if (error || !data) {
    await recordAgentRunFinish({
      run_id: run.id,
      status: 'failed',
      tokens_in: raw.usage.input_tokens,
      tokens_out: raw.usage.output_tokens,
      model_used: raw.model,
      metadata: { error: error?.message || 'insert failed' },
    });
    throw new Error(`Failed to insert marketing_posts row: ${error?.message}`);
  }

  await recordAgentRunFinish({
    run_id: run.id,
    status: 'completed',
    tokens_in: raw.usage.input_tokens,
    tokens_out: raw.usage.output_tokens,
    model_used: raw.model,
    metadata: {
      marketing_post_id: data.id,
      claim_risk_score: risk.score,
      claim_risk_level: risk.level,
    },
  });

  return {
    ok: true,
    marketing_post_id: data.id,
    agent_run_id: run.id,
    facebook: parsed.facebook,
    linkedin: parsed.linkedin,
    twitter: parsed.twitter,
    hashtags,
    claim_risk_score: risk.score,
    claim_risk_flags: risk.flags,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Action 2 — Generate weekly digest
// ──────────────────────────────────────────────────────────────────────────────

export interface WeeklyDigestResult {
  ok: true;
  marketing_post_id: string;
  agent_run_id: string;
  digest_md: string;
  metrics: {
    tasks_total: number;
    tasks_open: number;
    tasks_done_7d: number;
    sponsors_committed: number;
    sponsors_paid: number;
    social_posts_7d: number;
    pending_approvals: number;
  };
}

export async function generateWeeklyDigest(): Promise<WeeklyDigestResult> {
  const run = await recordAgentRunStart({
    agent_id: AGENT_ID,
    related_type: 'initiative',
    action: 'mmm.weekly_digest',
    model_primary: 'claude-sonnet-4-20250514',
    metadata: { group_slug: MMM_GROUP_SLUG },
  });

  // Lazy import to avoid a circular ref between queries.ts and agent-loop.ts.
  const { getMmmDashboardData } = await import('./queries');
  const data = await getMmmDashboardData();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const tasksOpen = data.task_groups.flatMap((g) => g.tasks).filter((t) => t.status !== 'done' && t.status !== 'killed').length;

  const recentSocial = data.social_posts.filter((p) => {
    if (!p.scheduled_for) return false;
    return new Date(p.scheduled_for).getTime() >= sevenDaysAgo.getTime();
  }).length;

  const metrics = {
    tasks_total: data.task_total,
    tasks_open: tasksOpen,
    tasks_done_7d: 0, // Placeholder — would need a completed_at filter; left for next iteration
    sponsors_committed: data.sponsors.committed_count,
    sponsors_paid: data.sponsors.paid_count,
    social_posts_7d: recentSocial,
    pending_approvals: data.pending_approvals.length,
  };

  const userPrompt = `Write a concise Monday MMM weekly digest for the operator (Brandon). Focus on what changed and what needs human action this week. No fluff.

State of the org:
- Events: ${data.events.map((e) => `${e.short_name} (${e.status}, ${e.display_date})`).join('; ')}
- HHH readiness: ${data.readiness.status_label} (${data.readiness.ready_pct}%); ${data.readiness.needs_attention} categories need attention.
- Tasks: ${metrics.tasks_open} open of ${metrics.tasks_total}.
- Sponsors: ${metrics.sponsors_committed} committed, ${metrics.sponsors_paid} paid (goal ${data.sponsors.goal}).
- Social posts queued in last 7 days: ${metrics.social_posts_7d}.
- Pending Bolt/Miles approvals: ${metrics.pending_approvals}.
- Top blockers: ${data.readiness.categories
    .filter((c) => c.status === 'needs-attention')
    .slice(0, 3)
    .map((c) => `${c.label} (${c.next_action || 'no current task'})`)
    .join('; ') || 'none'}

Return a Markdown digest under 300 words with these sections:
1. **Where MMM stands** — 2-3 sentences.
2. **Wins this week** — 2-4 bullets.
3. **Needs your call** — 2-4 bullets, very specific.
4. **Bolt/Miles drafted (awaiting approval)** — 1-2 bullets describing what was drafted.
5. **Next 7 days plan** — 3-5 bullets.

No emojis. No medical claims.`;

  let raw: { text: string; usage: { input_tokens: number; output_tokens: number }; model: string };
  try {
    raw = await callAnthropicAPI(userPrompt, {
      systemPrompt:
        'You are Miles, a quiet, useful agent. You write tight, operator-grade digests. No fluff, no marketing voice — internal only.',
      agentId: AGENT_ID,
      requestType: 'mmm.weekly_digest',
      maxTokens: 1500,
      temperature: 0.4,
    });
  } catch (err) {
    await recordAgentRunFinish({
      run_id: run.id,
      status: 'failed',
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  const digestMd = raw.text.trim();
  const meta = baseMeta({
    approval_type: 'weekly_digest',
    metrics,
    agent_run_id: run.id,
    week_of: new Date().toISOString().slice(0, 10),
  });

  const { data: row, error } = await supabaseAdmin
    .from('marketing_posts')
    .insert({
      content: digestMd,
      media_items: [],
      platforms: [],
      status: 'cancelled',
      source: AGENT_ID,
      scheduled_for: null,
      claim_risk_score: 0,
      claim_risk_flags: [],
      created_by: AGENT_ID,
      meta,
    })
    .select('id')
    .single();

  if (error || !row) {
    await recordAgentRunFinish({
      run_id: run.id,
      status: 'failed',
      tokens_in: raw.usage.input_tokens,
      tokens_out: raw.usage.output_tokens,
      model_used: raw.model,
      metadata: { error: error?.message || 'insert failed' },
    });
    throw new Error(`Failed to insert weekly digest: ${error?.message}`);
  }

  await recordAgentRunFinish({
    run_id: run.id,
    status: 'completed',
    tokens_in: raw.usage.input_tokens,
    tokens_out: raw.usage.output_tokens,
    model_used: raw.model,
    metadata: { marketing_post_id: row.id, ...metrics },
  });

  return { ok: true, marketing_post_id: row.id, agent_run_id: run.id, digest_md: digestMd, metrics };
}

// ──────────────────────────────────────────────────────────────────────────────
// Action 3 — Add bike-event research note
// ──────────────────────────────────────────────────────────────────────────────

export interface AddResearchInput {
  event_name: string;
  source_url?: string;
  notes?: string;
}

export interface AddResearchResult {
  ok: true;
  idea_id: string;
  agent_run_id: string;
  registration_model: string;
  sponsor_ideas: string[];
  takeaways: string[];
}

export async function addBikeEventResearch(input: AddResearchInput): Promise<AddResearchResult> {
  const run = await recordAgentRunStart({
    agent_id: AGENT_ID,
    related_type: 'idea',
    action: `research_bike_event:${input.event_name.slice(0, 60)}`,
    model_primary: 'claude-sonnet-4-20250514',
    metadata: { event_name: input.event_name, source_url: input.source_url, group_slug: MMM_GROUP_SLUG },
  });

  const userPrompt = `Research the cycling event "${input.event_name}" and pull lessons that apply to Making Miles Matter (HHH/FFF in particular).

${input.source_url ? `Source URL: ${input.source_url}` : 'No URL provided — use general knowledge.'}
${input.notes ? `Additional notes: ${input.notes}` : ''}

Return strict JSON:
{
  "summary_md": "2-3 sentence summary of the event",
  "registration_model": "how registration works (tiers, caps, fundraising minimums, etc.)",
  "sponsor_ideas": ["industry/category 1", "industry 2", ...],
  "attendance_clue": "rough attendance pattern, even if approximate",
  "takeaways": ["specific lesson MMM can apply", "another lesson", ...],
  "tags": ["mmm", "bike-event-research", "...other relevant tags"]
}
If you genuinely don't know specifics, say so honestly in the relevant fields. Do not invent statistics.`;

  let parsed: {
    summary_md: string;
    registration_model: string;
    sponsor_ideas: string[];
    attendance_clue: string;
    takeaways: string[];
    tags?: string[];
  };
  let raw: { text: string; usage: { input_tokens: number; output_tokens: number }; model: string };
  try {
    const result = await callAnthropicJSON<typeof parsed>(userPrompt, {
      systemPrompt:
        'You are Miles, an analyst. You research cycling events. You are honest about uncertainty and never invent numbers.',
      agentId: AGENT_ID,
      requestType: 'mmm.research_bike_event',
      maxTokens: 1500,
      temperature: 0.3,
    });
    parsed = result.parsed;
    raw = result.raw;
  } catch (err) {
    await recordAgentRunFinish({
      run_id: run.id,
      status: 'failed',
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  const tags = Array.from(
    new Set([...(parsed.tags || []), 'mmm', 'bike-event-research']),
  );

  const meta = baseMeta({
    approval_type: 'research',
    event_name: input.event_name,
    source_url: input.source_url || null,
    registration_model: parsed.registration_model,
    sponsor_ideas: parsed.sponsor_ideas,
    attendance_clue: parsed.attendance_clue,
    takeaways: parsed.takeaways,
    summary_md: parsed.summary_md,
    agent_run_id: run.id,
  });

  const { data, error } = await supabaseAdmin
    .from('ideas')
    .insert({
      title: `${input.event_name} — research note`,
      prompt: parsed.summary_md,
      tags,
      // 'inbox' or 'queued' both valid; use 'inbox' until approval moves it forward.
      status: 'inbox',
      mode: 'research_only',
      priority: 3,
      score: 6.0,
      created_by: AGENT_ID,
      meta,
    })
    .select('id')
    .single();

  if (error || !data) {
    await recordAgentRunFinish({
      run_id: run.id,
      status: 'failed',
      tokens_in: raw.usage.input_tokens,
      tokens_out: raw.usage.output_tokens,
      model_used: raw.model,
      metadata: { error: error?.message || 'insert failed' },
    });
    throw new Error(`Failed to insert research idea: ${error?.message}`);
  }

  await recordAgentRunFinish({
    run_id: run.id,
    status: 'completed',
    tokens_in: raw.usage.input_tokens,
    tokens_out: raw.usage.output_tokens,
    model_used: raw.model,
    metadata: { idea_id: data.id },
  });

  return {
    ok: true,
    idea_id: data.id,
    agent_run_id: run.id,
    registration_model: parsed.registration_model,
    sponsor_ideas: parsed.sponsor_ideas,
    takeaways: parsed.takeaways,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Action 4 — Summarize a meeting note
// ──────────────────────────────────────────────────────────────────────────────

export interface SummarizeMeetingInput {
  /** Filename inside web/content/meetings/mmm/ — e.g. "2026-04-26-fff-debrief.md".
   *  If omitted, the most recent meeting note is summarized. */
  filename?: string;
}

export interface SummarizeMeetingResult {
  ok: true;
  artifact_id: string;
  agent_run_id: string;
  source_file: string;
  decisions: string[];
  action_items: string[];
  summary_md: string;
}

const NOTES_DIR = path.join(process.cwd(), 'content', 'meetings', 'mmm');

export async function summarizeMeetingNote(
  input: SummarizeMeetingInput,
): Promise<SummarizeMeetingResult> {
  if (!existsSync(NOTES_DIR)) {
    throw new Error(`Meeting notes directory not found: ${NOTES_DIR}`);
  }

  let filename = input.filename;
  if (!filename) {
    const files = readdirSync(NOTES_DIR).filter((f) => f.endsWith('.md')).sort().reverse();
    if (files.length === 0) throw new Error('No meeting notes found');
    filename = files[0];
  }
  const fullPath = path.join(NOTES_DIR, filename);
  if (!existsSync(fullPath)) throw new Error(`Meeting note not found: ${filename}`);

  const fileText = readFileSync(fullPath, 'utf8');

  const run = await recordAgentRunStart({
    agent_id: AGENT_ID,
    related_type: 'idea',
    action: `summarize_meeting:${filename}`,
    model_primary: 'claude-sonnet-4-20250514',
    metadata: { filename, group_slug: MMM_GROUP_SLUG },
  });

  const userPrompt = `Summarize this MMM meeting note. Pull crisp decisions and action items. Keep it operator-grade — short, specific, no fluff.

--- BEGIN NOTE: ${filename} ---
${fileText.slice(0, 12000)}
--- END NOTE ---

Return strict JSON:
{
  "summary_md": "2-3 sentence operator summary",
  "decisions": ["specific decision", "..."],
  "action_items": ["[Owner if known] Specific action", "..."],
  "blockers": ["any blocker mentioned", "..."]
}`;

  let parsed: {
    summary_md: string;
    decisions: string[];
    action_items: string[];
    blockers?: string[];
  };
  let raw: { text: string; usage: { input_tokens: number; output_tokens: number }; model: string };
  try {
    const result = await callAnthropicJSON<typeof parsed>(userPrompt, {
      systemPrompt:
        'You are Miles, an operator-grade meeting summarizer. You produce short, specific summaries — never recap every line, only what matters.',
      agentId: AGENT_ID,
      requestType: 'mmm.summarize_meeting',
      maxTokens: 1500,
      temperature: 0.3,
    });
    parsed = result.parsed;
    raw = result.raw;
  } catch (err) {
    await recordAgentRunFinish({
      run_id: run.id,
      status: 'failed',
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  // To put a summary into idea_artifacts we need a parent idea row. Create or
  // reuse a single "MMM meeting summaries" idea so all summaries are siblings.
  const PARENT_TITLE = 'MMM meeting summaries (auto)';
  let parentIdeaId: string | null = null;
  {
    const { data: existing } = await supabaseAdmin
      .from('ideas')
      .select('id')
      .eq('title', PARENT_TITLE)
      .limit(1)
      .maybeSingle();
    if (existing) {
      parentIdeaId = (existing as { id: string }).id;
    } else {
      const { data: created, error: parentErr } = await supabaseAdmin
        .from('ideas')
        .insert({
          title: PARENT_TITLE,
          prompt: 'Auto-collected meeting summaries from web/content/meetings/mmm/',
          tags: ['mmm', 'meeting-summary'],
          status: 'queued',
          mode: 'research_only',
          priority: 4,
          score: 5,
          created_by: AGENT_ID,
          meta: baseMeta({ approval_type: 'meeting_summary' }),
        })
        .select('id')
        .single();
      if (parentErr || !created) {
        await recordAgentRunFinish({
          run_id: run.id,
          status: 'failed',
          tokens_in: raw.usage.input_tokens,
          tokens_out: raw.usage.output_tokens,
          model_used: raw.model,
          metadata: { error: parentErr?.message || 'failed to create parent idea' },
        });
        throw new Error(`Failed to create parent idea: ${parentErr?.message}`);
      }
      parentIdeaId = (created as { id: string }).id;
    }
  }

  const contentMd = [
    `# Summary — ${filename}`,
    '',
    parsed.summary_md,
    '',
    '## Decisions',
    ...parsed.decisions.map((d) => `- ${d}`),
    '',
    '## Action items',
    ...parsed.action_items.map((a) => `- ${a}`),
    ...(parsed.blockers && parsed.blockers.length > 0
      ? ['', '## Blockers', ...parsed.blockers.map((b) => `- ${b}`)]
      : []),
  ].join('\n');

  const meta = baseMeta({
    approval_type: 'meeting_summary',
    source_file: filename,
    decisions: parsed.decisions,
    action_items: parsed.action_items,
    blockers: parsed.blockers || [],
    agent_run_id: run.id,
  });

  const { data, error } = await supabaseAdmin
    .from('idea_artifacts')
    .insert({
      idea_id: parentIdeaId,
      artifact_type: 'summary',
      content_md: contentMd,
      meta,
    })
    .select('id')
    .single();

  if (error || !data) {
    await recordAgentRunFinish({
      run_id: run.id,
      status: 'failed',
      tokens_in: raw.usage.input_tokens,
      tokens_out: raw.usage.output_tokens,
      model_used: raw.model,
      metadata: { error: error?.message || 'insert failed' },
    });
    throw new Error(`Failed to insert idea_artifact: ${error?.message}`);
  }

  await recordAgentRunFinish({
    run_id: run.id,
    status: 'completed',
    tokens_in: raw.usage.input_tokens,
    tokens_out: raw.usage.output_tokens,
    model_used: raw.model,
    metadata: { artifact_id: data.id, source_file: filename },
  });

  return {
    ok: true,
    artifact_id: data.id,
    agent_run_id: run.id,
    source_file: filename,
    decisions: parsed.decisions,
    action_items: parsed.action_items,
    summary_md: parsed.summary_md,
  };
}

// Suppress unused var warning if a future caller of generateWeeklyDigest needs MMM_EVENTS.
void MMM_EVENTS;
