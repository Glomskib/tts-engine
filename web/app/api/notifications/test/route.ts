import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { sendTelegramNotification } from '@/lib/telegram';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * POST /api/notifications/test
 * Admin-only. Sends a test Telegram message.
 * Body (optional): { message: "custom text" }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse('FORBIDDEN', 'Admin access required', 403, correlationId);
  }

  let message = '🧪 Test notification from FlashFlow';
  try {
    const body = await request.json();
    if (body.message && typeof body.message === 'string') {
      message = body.message;
    }
  } catch {
    // no body is fine, use default message
  }

  await sendTelegramNotification(message);

  return NextResponse.json({
    ok: true,
    message: 'Test notification sent',
    correlation_id: correlationId,
  });
}
