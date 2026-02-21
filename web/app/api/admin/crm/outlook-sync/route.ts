/**
 * POST /api/admin/crm/outlook-sync — sync emails from Outlook Graph API
 * Returns 501 if env vars not configured.
 */
import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { isOutlookConfigured } from '@/lib/command-center/outlook-config';
import { syncOutlookEmails } from '@/lib/command-center/outlook-sync';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  if (!isOutlookConfigured()) {
    const response = NextResponse.json({
      ok: false,
      correlation_id: correlationId,
      error: 'Outlook sync is not configured. Set OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_TENANT_ID, and OUTLOOK_REFRESH_TOKEN env vars.',
    }, { status: 501 });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  }

  try {
    const result = await syncOutlookEmails();

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: result,
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return createApiErrorResponse('INTERNAL', message, 500, correlationId);
  }
}
