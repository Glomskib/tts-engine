/**
 * Milestone celebrations — shows a special toast the first time a user
 * completes a key action (first product, first script, first pipeline item).
 *
 * Uses localStorage to track which milestones have been triggered.
 */

const PREFIX = 'ff-celebration-';

export type Milestone = 'first-product' | 'first-script' | 'first-pipeline';

const MESSAGES: Record<Milestone, string> = {
  'first-product': 'First product added! Now generate a script for it in the Content Studio.',
  'first-script': 'First script created! You\'re on your way — add it to the pipeline when ready.',
  'first-pipeline': 'First video in the pipeline! Track it all the way to TikTok.',
};

/**
 * Check if a milestone has already been celebrated. If not, fire the
 * callback and mark it done. Returns true if the celebration fired.
 */
export function celebrate(
  milestone: Milestone,
  showSuccess: (message: string) => void,
): boolean {
  if (typeof window === 'undefined') return false;

  const key = `${PREFIX}${milestone}`;
  if (localStorage.getItem(key)) return false;

  localStorage.setItem(key, new Date().toISOString());
  showSuccess(MESSAGES[milestone]);
  return true;
}
