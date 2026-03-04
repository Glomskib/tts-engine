/**
 * GET /api/billing/client/[clientId]
 * Returns billing details for an agency client.
 * Auth: admin or agency owner (workspace ownership via agency_id).
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { getClientBillingDetails } from '@/lib/billing/getClientBillingDetails';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const { clientId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    // Ownership check: agency_id must match current user
    const { data: client } = await supabase
      .from('agency_clients')
      .select('id, agency_id')
      .eq('id', clientId)
      .eq('agency_id', user.id)
      .single();

    if (!client) {
      return createApiErrorResponse('NOT_FOUND', 'Client not found or access denied', 404, correlationId);
    }

    const billing = await getClientBillingDetails(clientId, user.id);

    if (!billing) {
      return createApiErrorResponse('NOT_FOUND', 'Billing details not available', 404, correlationId);
    }

    // Never expose the full stripe_customer_id to the frontend
    const { stripe_customer_id: _omit, ...safeBilling } = billing;

    return NextResponse.json({
      ok: true,
      billing: {
        ...safeBilling,
        has_stripe: billing.has_stripe,
      },
    });
  } catch (err) {
    console.error(`[${correlationId}] Client billing error:`, err);
    return createApiErrorResponse('INTERNAL', 'Failed to fetch billing details', 500, correlationId);
  }
}
