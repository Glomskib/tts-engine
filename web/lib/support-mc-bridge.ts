const MC_BASE_URL = process.env.MISSION_CONTROL_BASE_URL || process.env.MC_BASE_URL || 'https://mc.flashflowai.com';
const MC_AGENT_TOKEN = process.env.MISSION_CONTROL_AGENT_TOKEN || 'mc-agent-token-2026';

/**
 * Fire-and-forget POST to Mission Control documents API.
 * Logs new live-chat support threads as MC documents for visibility.
 */
export function crossPostToMC(threadId: string, subject: string, visitorEmail: string | null): void {
  const url = `${MC_BASE_URL}/api/documents`;
  const body = JSON.stringify({
    title: `[Support] ${subject}`,
    category: 'reference',
    lane: 'FlashFlow',
    content: `# Live Chat Support Thread\n\n- **Thread ID:** ${threadId}\n- **Visitor:** ${visitorEmail || 'anonymous'}\n- **Subject:** ${subject}\n- **Source:** live_chat\n- **Created:** ${new Date().toISOString()}`,
    tags: 'support,live-chat,auto',
  });

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MC_AGENT_TOKEN}`,
    },
    body,
  }).catch((err) => {
    console.error('[support-mc-bridge] Failed to cross-post to MC:', err.message);
  });
}
