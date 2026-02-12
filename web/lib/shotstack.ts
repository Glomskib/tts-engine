const SHOTSTACK_CONFIG = {
  sandbox: {
    baseUrl: 'https://api.shotstack.io/edit/stage',
    apiKey: process.env.SHOTSTACK_SANDBOX_KEY,
  },
  production: {
    baseUrl: 'https://api.shotstack.io/edit/v1',
    apiKey: process.env.SHOTSTACK_PRODUCTION_KEY,
  },
};

export function getShotstackConfig() {
  const env = (process.env.SHOTSTACK_ENV || 'sandbox') as 'sandbox' | 'production';
  const config = SHOTSTACK_CONFIG[env];
  if (!config.apiKey) throw new Error(`Missing Shotstack ${env} API key`);
  return { ...config, env };
}

export async function shotstackRequest(path: string, options: RequestInit = {}) {
  const config = getShotstackConfig();
  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shotstack ${response.status}: ${error}`);
  }

  return response.json();
}

export async function renderVideo(timeline: object) {
  return shotstackRequest('/render', {
    method: 'POST',
    body: JSON.stringify({ timeline }),
  });
}

export async function getRenderStatus(renderId: string) {
  return shotstackRequest(`/render/${renderId}`);
}
