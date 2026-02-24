/**
 * Telegram message intent classifier.
 *
 * Pure functions — no side effects, no DB calls.
 * Extracted from app/api/webhooks/telegram/route.ts for testability.
 */

/** Commands that explicitly trigger issue logging */
export const ISSUE_COMMANDS = ['/log', '/issue', '/bug', '/report'] as const;

/** Keywords that suggest the message MIGHT be an issue (needs confirmation) */
export const ISSUE_KEYWORDS =
  /\b(bug|error|broken|failed|crash(ed)?|issue|not working|doesn't work|can't|cannot|fix this|wrong|glitch|down)\b/i;

/** Phrases that explicitly request logging */
export const EXPLICIT_LOG_PHRASES =
  /\b(log (this|it)|file (a |an )?(bug|issue|report)|report (this |a |an )?(bug|issue|error)|triage this|save (this|it) as (an? )?(issue|bug))\b/i;

export type Intent = 'explicit_issue' | 'maybe_issue' | 'confirm_yes' | 'debug' | 'normal';

/** Confirmation prompt text — used by both the handler and the classifier. */
export const CONFIRMATION_PROMPT = 'Do you want me to log this as an issue?';

/**
 * Classify a Telegram message into an intent bucket.
 *
 * - explicit_issue: /log command OR explicit "log this" / "file a bug" phrases
 * - confirm_yes:    user replied "yes" to our confirmation prompt
 * - maybe_issue:    contains issue keywords but isn't explicit — needs confirmation
 * - normal:         everything else — don't touch it
 */
export function classifyIntent(
  text: string,
  isReply: boolean,
  replyText?: string,
): Intent {
  const lower = text.trim().toLowerCase();

  // 0. Debug command
  const firstWord = lower.split(/\s/)[0];
  if (firstWord === '/debug') return 'debug';

  // 1. Explicit issue commands
  if ((ISSUE_COMMANDS as readonly string[]).includes(firstWord)) return 'explicit_issue';

  // 2. "Yes" reply to our confirmation prompt (checked BEFORE explicit phrases
  //    so that "log it" in reply context means "yes" rather than a new issue)
  if (isReply && replyText?.includes(CONFIRMATION_PROMPT)) {
    if (/^(yes|y|yeah|yep|sure|do it|log it|confirm)\b/i.test(lower)) {
      return 'confirm_yes';
    }
  }

  // 3. Explicit logging phrases
  if (EXPLICIT_LOG_PHRASES.test(lower)) return 'explicit_issue';

  // 4. Issue-like keywords — ask for confirmation, don't auto-log
  if (ISSUE_KEYWORDS.test(lower)) return 'maybe_issue';

  // 5. Normal message
  return 'normal';
}
