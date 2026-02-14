import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';
export const maxDuration = 30;

type ServiceStatus = 'connected' | 'api_key_set' | 'error' | 'not_configured';

interface ServiceResult {
  name: string;
  key: string;
  status: ServiceStatus;
  latency?: number;
  message?: string;
  details?: string;
  manageUrl?: string;
}

// ---------- GET: return env-var presence for all services ----------
export async function GET(request: Request) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  if (!auth.isAdmin) return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);

  const services: ServiceResult[] = [
    {
      name: 'TikTok Shop',
      key: 'tiktok_shop',
      status: 'not_configured',
      manageUrl: '/admin/settings/tiktok',
    },
    {
      name: 'TikTok Content',
      key: 'tiktok_content',
      status: 'not_configured',
      manageUrl: '/admin/settings/tiktok',
    },
    {
      name: 'Stripe',
      key: 'stripe',
      status: process.env.STRIPE_SECRET_KEY ? 'api_key_set' : 'not_configured',
    },
    {
      name: 'Telegram Bot',
      key: 'telegram',
      status:
        process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
          ? 'api_key_set'
          : 'not_configured',
      manageUrl: '/admin/settings/telegram',
    },
    {
      name: 'ElevenLabs',
      key: 'elevenlabs',
      status: process.env.ELEVENLABS_API_KEY ? 'api_key_set' : 'not_configured',
    },
    {
      name: 'HeyGen',
      key: 'heygen',
      status: process.env.HEYGEN_API_KEY ? 'api_key_set' : 'not_configured',
    },
    {
      name: 'Runway',
      key: 'runway',
      status: process.env.RUNWAY_API_KEY ? 'api_key_set' : 'not_configured',
    },
    {
      name: 'Shotstack',
      key: 'shotstack',
      status:
        process.env.SHOTSTACK_SANDBOX_KEY || process.env.SHOTSTACK_PRODUCTION_KEY
          ? 'api_key_set'
          : 'not_configured',
    },
    {
      name: 'OpenAI (Whisper)',
      key: 'openai',
      status: process.env.OPENAI_API_KEY ? 'api_key_set' : 'not_configured',
    },
    {
      name: 'Anthropic',
      key: 'anthropic',
      status: process.env.ANTHROPIC_API_KEY ? 'api_key_set' : 'not_configured',
    },
    {
      name: 'Supabase',
      key: 'supabase',
      status:
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
          ? 'api_key_set'
          : 'not_configured',
    },
  ];

  // Check TikTok OAuth connections from DB
  try {
    const { count } = await supabaseAdmin
      .from('tiktok_accounts')
      .select('id', { count: 'exact', head: true })
      .abortSignal(AbortSignal.timeout(3000));
    if ((count ?? 0) > 0) {
      const shop = services.find((s) => s.key === 'tiktok_shop');
      if (shop) {
        shop.status = 'connected';
        shop.details = `${count} account(s)`;
      }
    }
  } catch { /* table may not exist */ }

  try {
    const { count } = await supabaseAdmin
      .from('tiktok_content_connections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'connected')
      .abortSignal(AbortSignal.timeout(3000));
    if ((count ?? 0) > 0) {
      const content = services.find((s) => s.key === 'tiktok_content');
      if (content) {
        content.status = 'connected';
        content.details = `${count} connected`;
      }
    }
  } catch { /* table may not exist */ }

  return NextResponse.json({ ok: true, services });
}

// ---------- POST: test a single service ----------
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(request);
  if (!auth.user) return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  if (!auth.isAdmin) return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);

  const { service } = await request.json();
  if (!service || typeof service !== 'string') {
    return createApiErrorResponse('VALIDATION_ERROR', 'Missing service key', 400, correlationId);
  }

  const result = await testService(service);
  return NextResponse.json({ ok: true, result });
}

async function testService(key: string): Promise<ServiceResult> {
  switch (key) {
    case 'supabase':
      return testSupabase();
    case 'heygen':
      return testHeyGen();
    case 'elevenlabs':
      return testElevenLabs();
    case 'runway':
      return testRunway();
    case 'shotstack':
      return testShotstack();
    case 'openai':
      return testOpenAI();
    case 'anthropic':
      return testAnthropic();
    case 'stripe':
      return testStripe();
    case 'telegram':
      return testTelegram();
    case 'tiktok_shop':
    case 'tiktok_content':
      return testTikTok(key);
    default:
      return { name: key, key, status: 'error', message: 'Unknown service' };
  }
}

async function testSupabase(): Promise<ServiceResult> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) return { name: 'Supabase', key: 'supabase', status: 'error', latency: Date.now() - start, message: error.message };
    return { name: 'Supabase', key: 'supabase', status: 'connected', latency: Date.now() - start, message: 'Database responding' };
  } catch (err) {
    return { name: 'Supabase', key: 'supabase', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testHeyGen(): Promise<ServiceResult> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return { name: 'HeyGen', key: 'heygen', status: 'not_configured', message: 'HEYGEN_API_KEY not set' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.heygen.com/v2/user/remaining_quota', {
      headers: { 'X-Api-Key': apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { name: 'HeyGen', key: 'heygen', status: 'error', latency: Date.now() - start, message: `HTTP ${res.status}` };
    const data = await res.json();
    const remaining = data?.data?.remaining_quota ?? data?.remaining_quota;
    return { name: 'HeyGen', key: 'heygen', status: 'connected', latency: Date.now() - start, details: remaining != null ? `${remaining} credits remaining` : 'OK' };
  } catch (err) {
    return { name: 'HeyGen', key: 'heygen', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testElevenLabs(): Promise<ServiceResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { name: 'ElevenLabs', key: 'elevenlabs', status: 'not_configured', message: 'ELEVENLABS_API_KEY not set' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { name: 'ElevenLabs', key: 'elevenlabs', status: 'error', latency: Date.now() - start, message: `HTTP ${res.status}` };
    const data = await res.json();
    const remaining = (data?.character_limit ?? 0) - (data?.character_count ?? 0);
    return { name: 'ElevenLabs', key: 'elevenlabs', status: 'connected', latency: Date.now() - start, details: `${remaining.toLocaleString()} chars remaining` };
  } catch (err) {
    return { name: 'ElevenLabs', key: 'elevenlabs', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testRunway(): Promise<ServiceResult> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) return { name: 'Runway', key: 'runway', status: 'not_configured', message: 'RUNWAY_API_KEY not set' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.dev.runwayml.com/v1/tasks?limit=1', {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { name: 'Runway', key: 'runway', status: 'error', latency: Date.now() - start, message: `HTTP ${res.status}` };
    return { name: 'Runway', key: 'runway', status: 'connected', latency: Date.now() - start, details: 'API reachable' };
  } catch (err) {
    return { name: 'Runway', key: 'runway', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testShotstack(): Promise<ServiceResult> {
  const env = (process.env.SHOTSTACK_ENV || 'sandbox') as 'sandbox' | 'production';
  const apiKey = env === 'production' ? process.env.SHOTSTACK_PRODUCTION_KEY : process.env.SHOTSTACK_SANDBOX_KEY;
  if (!apiKey) return { name: 'Shotstack', key: 'shotstack', status: 'not_configured', message: 'Shotstack API key not set' };
  const baseUrl = env === 'production' ? 'https://api.shotstack.io/edit/v1' : 'https://api.shotstack.io/edit/stage';
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/render`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 401 || res.status === 403) return { name: 'Shotstack', key: 'shotstack', status: 'error', latency: Date.now() - start, message: 'Invalid API key' };
    return { name: 'Shotstack', key: 'shotstack', status: 'connected', latency: Date.now() - start, details: `env: ${env}` };
  } catch (err) {
    return { name: 'Shotstack', key: 'shotstack', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testOpenAI(): Promise<ServiceResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { name: 'OpenAI (Whisper)', key: 'openai', status: 'not_configured', message: 'OPENAI_API_KEY not set' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/models?limit=1', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { name: 'OpenAI (Whisper)', key: 'openai', status: 'error', latency: Date.now() - start, message: `HTTP ${res.status}` };
    return { name: 'OpenAI (Whisper)', key: 'openai', status: 'connected', latency: Date.now() - start, details: 'API reachable' };
  } catch (err) {
    return { name: 'OpenAI (Whisper)', key: 'openai', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testAnthropic(): Promise<ServiceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { name: 'Anthropic', key: 'anthropic', status: 'not_configured', message: 'ANTHROPIC_API_KEY not set' };
  const start = Date.now();
  try {
    // List models as a lightweight health check
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { name: 'Anthropic', key: 'anthropic', status: 'error', latency: Date.now() - start, message: `HTTP ${res.status}` };
    return { name: 'Anthropic', key: 'anthropic', status: 'connected', latency: Date.now() - start, details: 'API reachable' };
  } catch (err) {
    return { name: 'Anthropic', key: 'anthropic', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testStripe(): Promise<ServiceResult> {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return { name: 'Stripe', key: 'stripe', status: 'not_configured', message: 'STRIPE_SECRET_KEY not set' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { name: 'Stripe', key: 'stripe', status: 'error', latency: Date.now() - start, message: `HTTP ${res.status}` };
    return { name: 'Stripe', key: 'stripe', status: 'connected', latency: Date.now() - start, details: 'Balance API OK' };
  } catch (err) {
    return { name: 'Stripe', key: 'stripe', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testTelegram(): Promise<ServiceResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { name: 'Telegram Bot', key: 'telegram', status: 'not_configured', message: 'Token or Chat ID missing' };
  const start = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { name: 'Telegram Bot', key: 'telegram', status: 'error', latency: Date.now() - start, message: `HTTP ${res.status}` };
    const data = await res.json();
    const botName = data?.result?.username;
    return { name: 'Telegram Bot', key: 'telegram', status: 'connected', latency: Date.now() - start, details: botName ? `@${botName}` : 'Bot OK' };
  } catch (err) {
    return { name: 'Telegram Bot', key: 'telegram', status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function testTikTok(key: string): Promise<ServiceResult> {
  const table = key === 'tiktok_shop' ? 'tiktok_accounts' : 'tiktok_content_connections';
  const name = key === 'tiktok_shop' ? 'TikTok Shop' : 'TikTok Content';
  const start = Date.now();
  try {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .abortSignal(AbortSignal.timeout(5000));
    if (error) return { name, key, status: 'error', latency: Date.now() - start, message: error.message };
    if ((count ?? 0) > 0) return { name, key, status: 'connected', latency: Date.now() - start, details: `${count} account(s)` };
    return { name, key, status: 'not_configured', latency: Date.now() - start, message: 'No accounts connected' };
  } catch (err) {
    return { name, key, status: 'error', latency: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}
