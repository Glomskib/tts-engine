/**
 * @module flashflow/issues
 *
 * Thin DB helpers for the ff_issue_reports / ff_issue_actions tables.
 * Follows the same non-throwing pattern as lib/flashflow/generations.ts.
 *
 * Usage:
 *   import { createIssue, findByFingerprint } from '@/lib/flashflow/issues';
 */

import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateIssueInput {
  source: string;
  reporter?: string;
  message_text: string;
  context_json?: Record<string, unknown>;
  severity?: string;
  fingerprint: string;
}

/**
 * Status lifecycle:
 *   new → triaged → in_progress → pr_open → deployed → verified → closed
 *   (+ dismissed at any point)
 */
export interface IssueRow {
  id: string;
  source: string;
  reporter: string | null;
  message_text: string;
  context_json: Record<string, unknown>;
  severity: string;
  status: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

export interface IssueActionRow {
  id: string;
  issue_id: string;
  action_type: string;
  payload_json: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 fingerprint for deduplication.
 * Normalizes: source + lowercase(messageText) + optional path.
 */
export function computeFingerprint(
  source: string,
  messageText: string,
  path?: string,
): string {
  const normalized = [source, messageText.toLowerCase(), path ?? ''].join('|');
  return createHash('sha256').update(normalized).digest('hex');
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Find an existing issue by fingerprint. Returns the row or null.
 */
export async function findByFingerprint(
  fingerprint: string,
): Promise<IssueRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_issue_reports')
      .select('*')
      .eq('fingerprint', fingerprint)
      .maybeSingle();

    if (error) {
      console.error('[ff:issues] findByFingerprint failed:', error.message);
      return null;
    }

    return data as IssueRow | null;
  } catch (err) {
    console.error('[ff:issues] findByFingerprint exception:', err);
    return null;
  }
}

/**
 * Insert a new issue into ff_issue_reports. Non-throwing.
 */
export async function createIssue(
  input: CreateIssueInput,
): Promise<IssueRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_issue_reports')
      .insert({
        source: input.source,
        reporter: input.reporter ?? null,
        message_text: input.message_text,
        context_json: input.context_json ?? {},
        severity: input.severity ?? 'unknown',
        fingerprint: input.fingerprint,
      })
      .select()
      .single();

    if (error) {
      console.error('[ff:issues] createIssue failed:', error.message);
      return null;
    }

    return data as IssueRow;
  } catch (err) {
    console.error('[ff:issues] createIssue exception:', err);
    return null;
  }
}

/**
 * Log an action against an issue. Non-throwing.
 */
export async function logIssueAction(
  issueId: string,
  actionType: string,
  payload?: Record<string, unknown>,
): Promise<IssueActionRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_issue_actions')
      .insert({
        issue_id: issueId,
        action_type: actionType,
        payload_json: payload ?? {},
      })
      .select()
      .single();

    if (error) {
      console.error('[ff:issues] logIssueAction failed:', error.message);
      return null;
    }

    return data as IssueActionRow;
  } catch (err) {
    console.error('[ff:issues] logIssueAction exception:', err);
    return null;
  }
}

/**
 * Update fields on an existing issue. Non-throwing.
 */
export async function updateIssue(
  id: string,
  fields: Partial<Pick<IssueRow, 'severity' | 'status'>>,
): Promise<IssueRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_issue_reports')
      .update(fields)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[ff:issues] updateIssue failed:', error.message);
      return null;
    }

    return data as IssueRow;
  } catch (err) {
    console.error('[ff:issues] updateIssue exception:', err);
    return null;
  }
}
