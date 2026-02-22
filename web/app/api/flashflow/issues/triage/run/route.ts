/**
 * POST /api/flashflow/issues/triage/run
 *
 * Admin-only endpoint. Pulls issues with status='new', runs LLM triage
 * via callAnthropicJSON, updates severity/status, and optionally posts
 * high/critical issues to Mission Control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { callAnthropicJSON } from '@/lib/ai/anthropic';
import { postMCDoc } from '@/lib/flashflow/mission-control';
import { logIssueAction, updateIssue, type IssueRow } from '@/lib/flashflow/issues';

export const runtime = 'nodejs';

interface TriageResult {
  severity: 'low' | 'medium' | 'high' | 'critical';
  subsystem: string;
  summary: string;
  suggested_fix_steps: string[];
  claude_code_prompt: string;
}

export async function POST(request: NextRequest) {
  const correlationId =
    request.headers.get('x-correlation-id') || generateCorrelationId();

  // Admin-only
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  // Pull new issues
  const { data: issues, error: fetchError } = await supabaseAdmin
    .from('ff_issue_reports')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(20);

  if (fetchError) {
    console.error(`[${correlationId}] Triage fetch error:`, fetchError);
    return createApiErrorResponse('DB_ERROR', fetchError.message, 500, correlationId);
  }

  if (!issues || issues.length === 0) {
    const res = NextResponse.json(
      { ok: true, triaged: 0, message: 'No new issues to triage', correlation_id: correlationId },
    );
    res.headers.set('x-correlation-id', correlationId);
    return res;
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
        correlationId,
        requestType: 'analysis',
        agentId: 'issue-triage',
      });

      // Update issue severity + status
      await updateIssue(issue.id, { severity: parsed.severity, status: 'triaged' });

      // Log triage action with full payload
      await logIssueAction(issue.id, 'triage', parsed as unknown as Record<string, unknown>);

      results.push({
        issue_id: issue.id,
        severity: parsed.severity,
        subsystem: parsed.subsystem,
      });

      // Post to Mission Control for high/critical only (fire-and-forget)
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
        }).catch((err) => {
          console.error(`[${correlationId}] MC post error (non-fatal):`, err);
        });
      }
    } catch (err) {
      console.error(`[${correlationId}] Triage failed for issue ${issue.id}:`, err);
    }
  }

  const res = NextResponse.json({
    ok: true,
    triaged: results.length,
    total_new: issues.length,
    results,
    correlation_id: correlationId,
  });
  res.headers.set('x-correlation-id', correlationId);
  return res;
}
