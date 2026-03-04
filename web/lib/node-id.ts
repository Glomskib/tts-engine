/**
 * Deterministic node identity for session status and actor logging.
 *
 * Returns FF_NODE_ID if set, otherwise falls back to os.hostname().
 * This eliminates hostname drift between terminal and launchd contexts
 * (e.g. "Brandons-Mac-mini.local" vs "Mac.lan" vs "dc45c14b-...").
 */

import * as os from 'os';

/** Stable node identifier — use this instead of os.hostname(). */
export function getNodeId(): string {
  return process.env.FF_NODE_ID || os.hostname();
}
