import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
  lastChecked: string;
}

export async function GET() {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: HealthCheck[] = [];
  const startTime = Date.now();

  // Check Supabase connection
  const supabaseCheck = await checkSupabase();
  checks.push(supabaseCheck);

  // Check Replicate API
  const replicateCheck = await checkReplicate();
  checks.push(replicateCheck);

  // Check OpenAI API
  const openaiCheck = await checkOpenAI();
  checks.push(openaiCheck);

  // Check ElevenLabs API
  const elevenlabsCheck = await checkElevenLabs();
  checks.push(elevenlabsCheck);

  // Overall status
  const overallStatus = checks.every(c => c.status === 'healthy')
    ? 'healthy'
    : checks.some(c => c.status === 'unhealthy')
    ? 'unhealthy'
    : 'degraded';

  return NextResponse.json({
    status: overallStatus,
    checks,
    totalLatency: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  });
}

async function checkSupabase(): Promise<HealthCheck> {
  const start = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      name: 'Supabase',
      status: 'unhealthy',
      message: 'Configuration missing',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Simple query to check connection
    const { error } = await supabase.from('profiles').select('id').limit(1);

    if (error) {
      return {
        name: 'Supabase',
        status: 'unhealthy',
        latency: Date.now() - start,
        message: error.message,
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      name: 'Supabase',
      status: 'healthy',
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name: 'Supabase',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkReplicate(): Promise<HealthCheck> {
  const start = Date.now();
  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    return {
      name: 'Replicate',
      status: 'unhealthy',
      message: 'API token not configured',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    const res = await fetch('https://api.replicate.com/v1/models', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        name: 'Replicate',
        status: res.status === 401 ? 'unhealthy' : 'degraded',
        latency: Date.now() - start,
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      name: 'Replicate',
      status: 'healthy',
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name: 'Replicate',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkOpenAI(): Promise<HealthCheck> {
  const start = Date.now();
  const token = process.env.OPENAI_API_KEY;

  if (!token) {
    return {
      name: 'OpenAI',
      status: 'unhealthy',
      message: 'API key not configured',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        name: 'OpenAI',
        status: res.status === 401 ? 'unhealthy' : 'degraded',
        latency: Date.now() - start,
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      name: 'OpenAI',
      status: 'healthy',
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name: 'OpenAI',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkElevenLabs(): Promise<HealthCheck> {
  const start = Date.now();
  const token = process.env.ELEVENLABS_API_KEY;

  if (!token) {
    return {
      name: 'ElevenLabs',
      status: 'unhealthy',
      message: 'API key not configured',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': token },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return {
        name: 'ElevenLabs',
        status: res.status === 401 ? 'unhealthy' : 'degraded',
        latency: Date.now() - start,
        message: `HTTP ${res.status}`,
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      name: 'ElevenLabs',
      status: 'healthy',
      latency: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name: 'ElevenLabs',
      status: 'degraded',
      latency: Date.now() - start,
      message: err instanceof Error ? err.message : 'Request failed',
      lastChecked: new Date().toISOString(),
    };
  }
}
