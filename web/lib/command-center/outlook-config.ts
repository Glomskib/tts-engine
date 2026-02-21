/**
 * Outlook / Microsoft Graph API configuration.
 * Reads env vars and provides auth helpers.
 */

export function isOutlookConfigured(): boolean {
  return !!(
    process.env.OUTLOOK_CLIENT_ID &&
    process.env.OUTLOOK_CLIENT_SECRET &&
    process.env.OUTLOOK_TENANT_ID &&
    process.env.OUTLOOK_REFRESH_TOKEN
  );
}

export function getOutlookConfig() {
  return {
    clientId: process.env.OUTLOOK_CLIENT_ID || '',
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
    tenantId: process.env.OUTLOOK_TENANT_ID || '',
    refreshToken: process.env.OUTLOOK_REFRESH_TOKEN || '',
    watchedSenders: (process.env.CRM_WATCHED_SENDERS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

/**
 * Exchange refresh token for a new access token via Microsoft identity platform.
 */
export async function getOutlookAccessToken(): Promise<string> {
  const config = getOutlookConfig();
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://graph.microsoft.com/.default',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook token exchange failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.access_token;
}
