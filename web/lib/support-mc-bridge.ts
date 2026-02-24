const MC_BASE_URL = process.env.MISSION_CONTROL_BASE_URL || process.env.MC_BASE_URL || 'https://mc.flashflowai.com';
// Canonical token: MISSION_CONTROL_TOKEN → MISSION_CONTROL_AGENT_TOKEN (no MC_API_TOKEN)
const MC_TOKEN = process.env.MISSION_CONTROL_TOKEN || process.env.MISSION_CONTROL_AGENT_TOKEN || '';

/**
 * Fire-and-forget POST to Mission Control documents API.
 * Logs new live-chat support threads as MC documents for visibility.
 * Sends both Authorization: Bearer and x-service-token for compatibility.
 */
export function crossPostToMC(threadId: string, subject: string, visitorEmail: string | null): void {
  if (!MC_TOKEN) {
    console.warn('[support-mc-bridge] No MC token configured (set MISSION_CONTROL_TOKEN)');
    return;
  }

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
      'Authorization': `Bearer ${MC_TOKEN}`,
      'x-service-token': MC_TOKEN,
    },
    body,
  }).then((res) => {
    if (!res.ok) {
      console.error(`[support-mc-bridge] POST ${url} → HTTP ${res.status} | headers=[Bearer, x-service-token] | tokenSource=${process.env.MISSION_CONTROL_TOKEN ? 'MISSION_CONTROL_TOKEN' : 'MISSION_CONTROL_AGENT_TOKEN'}`);
    }
  }).catch((err) => {
    console.error('[support-mc-bridge] Failed to cross-post to MC:', err.message);
  });
}
