/**
 * Format the reply header line for a TikTok comment reply bubble.
 * Matches TikTok's exact phrasing: "Reply to @<commenter>'s comment"
 */
export function formatReplyHeader(commenter: string): string {
  const name = commenter.trim() || 'someone';
  return `Reply to @${name}'s comment`;
}
