import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { callAnthropicJSON } from '@/lib/ai/anthropic';
import { postMCDoc } from '@/lib/flashflow/mission-control';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function verifyIssuesSecret(request: Request): boolean {
  const secret = process.env.FF_ISSUES_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

interface TriageResult {
  severity: 'low' | 'medium' | 'high' | 'critical';
  subsystem: string;
  summary: string;
  claude_prompt_text: string;
}

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  if (!verifyIssuesSecret(request)) {
    return createApiErrorResponse('UNAUTHORIZED', 'Invalid or missing FF_ISSUES_SECRET', 401, correlationId);
  }

  // Pull all issues with status = 'new'
  const { data: issues, error: fetchError } = await supabaseAdmin
    .from('ff_issue_reports')
    .select('id, source, reporter, message_text, context_json, severity')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(20);

  if (fetchError) {
    console.error(`[${correlationId}] Triage fetch error:`, fetchError);
    return createApiErrorResponse('DB_ERROR', fetchError.message, 500, correlationId);
  }

  if (!issues || issues.length === 0) {
    return NextResponse.json({ ok: true, triaged: 0, message: 'No new issues to triage' });
  }

  const results: { issue_id: string; severity: string; subsystem: string }[] = [];

  for (const issue of issues) {
    try {
      const prompt = `You are a software issue triage agent for FlashFlow, a TTS video generation SaaS platform.

Analyze this issue report and classify it.

Source: ${issue.source}
Reporter: ${issue.reporter || 'unknown'}
Message: ${issue.message_text}
Context: ${JSON.stringify(issue.context_json)}

Respond with JSON:
{
  "severity": "low" | "medium" | "high" | "critical",
  "subsystem": "<which part of the system: auth, billing, video-pipeline, ai-generation, tiktok-upload, admin, api, infrastructure, other>",
  "summary": "<one-sentence summary of the issue>",
  "claude_prompt_text": "<a prompt that could be given to Claude Code to investigate and fix this issue>"
}`;

      const { parsed } = await callAnthropicJSON<TriageResult>(prompt, {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 1024,
        temperature: 0.3,
        correlationId,
        requestType: 'analysis',
        agentId: 'issue-triage',
      });

      // Update issue severity and status
      await supabaseAdmin
        .from('ff_issue_reports')
        .update({ severity: parsed.severity, status: 'triaged' })
        .eq('id', issue.id);

      // Log triage action
      await supabaseAdmin
        .from('ff_issue_actions')
        .insert({
          issue_id: issue.id,
          action_type: 'triage',
          payload_json: parsed,
        });

      results.push({
        issue_id: issue.id,
        severity: parsed.severity,
        subsystem: parsed.subsystem,
      });

      // Post to Mission Control (fire-and-forget)
      postMCDoc({
        title: `Issue: ${parsed.summary}`,
        content: [
          `**Severity:** ${parsed.severity}`,
          `**Subsystem:** ${parsed.subsystem}`,
          `**Source:** ${issue.source}`,
          `**Reporter:** ${issue.reporter || 'unknown'}`,
          '',
          `> ${issue.message_text}`,
          '',
          '**Claude prompt:**',
          parsed.claude_prompt_text,
        ].join('\n'),
        lane: 'FlashFlow',
        tags: ['issues', parsed.severity, parsed.subsystem],
      }).catch((err) => {
        console.error(`[${correlationId}] MC post error (non-fatal):`, err);
      });
    } catch (err) {
      console.error(`[${correlationId}] Triage failed for issue ${issue.id}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    triaged: results.length,
    total_new: issues.length,
    results,
    correlation_id: correlationId,
  });
}
