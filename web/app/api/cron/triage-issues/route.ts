/**
 * Cron: Triage new issues — every 15 minutes
 *
 * Pulls up to 20 issues with status='new', runs AI classification,
 * updates severity/status, and posts high/critical to Mission Control.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { callAnthropicJSON } from '@/lib/ai/anthropic';
import { postMCDoc } from '@/lib/flashflow/mission-control';
import { logIssueAction, updateIssue, type IssueRow } from '@/lib/flashflow/issues';
import { sendTelegramLog } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface TriageResult {
  severity: 'low' | 'medium' | 'high' | 'critical';
  subsystem: string;
  summary: string;
  suggested_fix_steps: string[];
  claude_code_prompt: string;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: issues, error: fetchError } = await supabaseAdmin
    .from('ff_issue_reports')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(20);

  if (fetchError) {
    console.error('[cron/triage-issues] Fetch error:', fetchError);
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  if (!issues || issues.length === 0) {
    return NextResponse.json({ ok: true, triaged: 0, message: 'No new issues' });
  }

  const results: { issue_id: string; severity: string; subsystem: string }[] = [];

  for (const issue of issues as IssueRow[]) {
    try {
      const prompt = `You are a software issue triage agent for FlashFlow, a TTS video generation SaaS platform.

Analyze this issue report and classify it.

Source: ${issue.source}
Reporter: ${issue.reporter || 'unknown'}
Message: ${issue.message_text}
Context: ${JSON.stringify(issue.context_json)}

Respond with JSON only:
{
  "severity": "low" | "medium" | "high" | "critical",
  "subsystem": "<which part of the system: auth, billing, video-pipeline, ai-generation, tiktok-upload, admin, api, infrastructure, other>",
  "summary": "<one-sentence summary of the issue>",
  "suggested_fix_steps": ["<step 1>", "<step 2>", ...],
  "claude_code_prompt": "<a prompt that could be given to Claude Code to investigate and fix this issue>"
}`;

      const { parsed } = await callAnthropicJSON<TriageResult>(prompt, {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 1024,
        temperature: 0.3,
        requestType: 'analysis',
        agentId: 'issue-triage-cron',
      });

      await updateIssue(issue.id, { severity: parsed.severity, status: 'triaged' });
      await logIssueAction(issue.id, 'triage', parsed as unknown as Record<string, unknown>);

      results.push({
        issue_id: issue.id,
        severity: parsed.severity,
        subsystem: parsed.subsystem,
      });

      // Post high/critical to Mission Control
      if (parsed.severity === 'high' || parsed.severity === 'critical') {
        postMCDoc({
          title: `Issue [${parsed.severity.toUpperCase()}]: ${parsed.summary}`,
          content: [
            `**Severity:** ${parsed.severity}`,
            `**Subsystem:** ${parsed.subsystem}`,
            `**Source:** ${issue.source}`,
            `**Reporter:** ${issue.reporter || 'unknown'}`,
            '',
            `> ${issue.message_text}`,
            '',
            '**Suggested fix steps:**',
            ...parsed.suggested_fix_steps.map((s, i) => `${i + 1}. ${s}`),
            '',
            '**Claude Code prompt:**',
            parsed.claude_code_prompt,
          ].join('\n'),
          lane: 'FlashFlow',
          tags: ['issues', parsed.severity],
        }).catch((err) => console.error('[cron/triage-issues] MC post error:', err));
      }

      // Notify on Telegram for high/critical
      if (parsed.severity === 'high' || parsed.severity === 'critical') {
        sendTelegramLog(
          `\u{1F6A8} <b>[${parsed.severity.toUpperCase()}] ${parsed.subsystem}</b>\n` +
          `${parsed.summary}\n` +
          `<b>Source:</b> ${issue.source} | <b>Reporter:</b> ${issue.reporter || 'unknown'}`
        );
      }
    } catch (err) {
      const { captureRouteException } = await import('@/lib/errorTracking');
      captureRouteException(err instanceof Error ? err : new Error(String(err)), {
        route: '/api/cron/triage-issues', jobId: issue.id,
      });
      console.error(`[cron/triage-issues] Failed for ${issue.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, triaged: results.length, results });
}
