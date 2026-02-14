import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { sendTelegramNotification } from '@/lib/telegram';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

interface ServiceCheck {
  name: string;
  status: string;
  latency?: number;
  message?: string;
  details?: string;
}

interface SystemStatusData {
  status: string;
  services: ServiceCheck[];
  pipeline: {
    stuckRendering: number;
    stuckReview: number;
    failedLast24h: number;
  };
  usage: {
    totalUsers: number;
    activeThisWeek: number;
    creditsConsumedToday: number;
  };
  totalLatency: number;
  timestamp: string;
}

export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  try {
    // Fetch system status from the sibling endpoint
    const baseUrl = request.headers.get('x-forwarded-proto') && request.headers.get('host')
      ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const statusRes = await fetch(`${baseUrl}/api/admin/system-status`, {
      headers: {
        cookie: request.headers.get('cookie') || '',
        authorization: request.headers.get('authorization') || '',
      },
    });

    if (!statusRes.ok) {
      return createApiErrorResponse('INTERNAL', 'Failed to fetch system status', 500, correlationId);
    }

    const data: SystemStatusData = await statusRes.json();
    const message = formatTelegramReport(data);
    await sendTelegramNotification(message);

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (err) {
    console.error('[system-status/telegram] Error:', err);
    return createApiErrorResponse(
      'INTERNAL',
      err instanceof Error ? err.message : 'Failed to send report',
      500,
      correlationId
    );
  }
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'healthy': return '\u2705';
    case 'degraded': return '\u26A0\uFE0F';
    case 'unhealthy': return '\u274C';
    case 'not_configured': return '\u2B1C';
    default: return '\u2753';
  }
}

function formatTelegramReport(data: SystemStatusData): string {
  const overallEmoji = statusEmoji(data.status);
  const lines: string[] = [];

  lines.push(`${overallEmoji} <b>System Status: ${data.status.toUpperCase()}</b>`);
  lines.push(`<i>${new Date(data.timestamp).toLocaleString('en-US', { timeZone: 'America/New_York' })}</i>`);
  lines.push('');

  // Services
  lines.push('<b>Services:</b>');
  for (const svc of data.services) {
    let line = `${statusEmoji(svc.status)} ${svc.name}`;
    if (svc.latency != null) line += ` (${svc.latency}ms)`;
    if (svc.details) line += ` — ${svc.details}`;
    if (svc.message && svc.status !== 'healthy') line += ` — ${svc.message}`;
    lines.push(line);
  }
  lines.push('');

  // Pipeline
  lines.push('<b>Pipeline:</b>');
  lines.push(`\u{1F534} Stuck rendering (&gt;2h): ${data.pipeline.stuckRendering}`);
  lines.push(`\u{1F7E1} Stuck review (&gt;24h): ${data.pipeline.stuckReview}`);
  lines.push(`\u274C Failed (24h): ${data.pipeline.failedLast24h}`);
  lines.push('');

  // Usage
  lines.push('<b>Usage:</b>');
  lines.push(`\u{1F465} Total users: ${data.usage.totalUsers}`);
  lines.push(`\u{1F4C8} Active (7d): ${data.usage.activeThisWeek}`);
  lines.push(`\u{1F4B3} Credits today: ${data.usage.creditsConsumedToday}`);
  lines.push('');

  lines.push(`<i>Latency: ${data.totalLatency}ms</i>`);

  return lines.join('\n');
}
