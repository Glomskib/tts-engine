export function getShotstackConfig() {
  const env = (process.env.SHOTSTACK_ENV || 'sandbox') as 'sandbox' | 'production';
  const configs = {
    sandbox: {
      baseUrl: 'https://api.shotstack.io/edit/stage',
      apiKey: process.env.SHOTSTACK_SANDBOX_KEY,
    },
    production: {
      baseUrl: 'https://api.shotstack.io/edit/v1',
      apiKey: process.env.SHOTSTACK_PRODUCTION_KEY,
    },
  };
  const config = configs[env];
  if (!config?.apiKey) throw new Error(`Missing SHOTSTACK_${env.toUpperCase()}_KEY env var`);
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

/**
 * Build a simple timeline from high-level params and submit a render.
 * Bolt can call this instead of constructing raw Shotstack timelines.
 */
export async function createSimpleRender(params: {
  imageUrl?: string;
  text?: string;
  duration?: number;
  background?: string;
}) {
  const duration = params.duration ?? 5;
  const clips: object[] = [];

  // Background color clip
  if (params.background) {
    clips.push({
      asset: {
        type: 'html',
        html: `<div style="width:100%;height:100%;background:${params.background}"></div>`,
        width: 1080,
        height: 1920,
      },
      start: 0,
      length: duration,
    });
  }

  // Image clip
  if (params.imageUrl) {
    clips.push({
      asset: {
        type: 'image',
        src: params.imageUrl,
      },
      start: 0,
      length: duration,
      fit: 'contain',
      position: 'center',
    });
  }

  // Text overlay
  if (params.text) {
    clips.push({
      asset: {
        type: 'html',
        html: `<div style="font-family:Arial;font-size:48px;color:#fff;text-align:center;padding:40px;text-shadow:2px 2px 4px rgba(0,0,0,0.8)">${params.text}</div>`,
        width: 1080,
        height: 400,
      },
      start: 0,
      length: duration,
      position: 'bottom',
      offset: { y: 0.1 },
    });
  }

  // Need at least one clip
  if (clips.length === 0) {
    throw new Error('At least one of imageUrl, text, or background is required');
  }

  const timeline = {
    background: params.background || '#000000',
    tracks: [{ clips }],
  };

  return renderVideo(timeline);
}
