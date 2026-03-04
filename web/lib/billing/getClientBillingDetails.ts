/**
 * Client Billing Details Loader
 *
 * Aggregates billing data for an agency client:
 *   - Plan info from agency_clients + PLAN_DETAILS
 *   - Stripe payment method & invoices (if linked)
 *   - Video usage from agency_clients
 *
 * Does NOT duplicate Stripe logic — uses existing getUserSubscription()
 * and lazy Stripe client pattern from lib/subscriptions.ts.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { PLAN_DETAILS, type PlanDetails } from '@/lib/subscriptions';
import Stripe from 'stripe';

// ── Types ─────────────────────────────────────────────────────

export interface ClientBillingInvoice {
  id: string;
  amount: number; // cents
  status: string;
  date: string; // ISO date
  invoice_url: string | null;
}

export interface ClientBillingDetails {
  plan: string;
  plan_display_name: string;
  billing_cycle: 'monthly' | 'annual' | 'none';
  next_invoice_date: string | null;
  payment_method_last4: string | null;
  payment_method_brand: string | null;
  monthly_price: number; // cents
  usage_summary: {
    videos_used: number;
    videos_quota: number;
    storage_bytes: number;
  };
  invoices: ClientBillingInvoice[];
  stripe_customer_id: string | null;
  has_stripe: boolean;
}

// ── Stripe singleton ──────────────────────────────────────────

let stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

// ── Main loader ───────────────────────────────────────────────

export async function getClientBillingDetails(
  clientId: string,
  agencyId: string,
): Promise<ClientBillingDetails | null> {
  // 1. Get the agency_clients row (with ownership check)
  const { data: client, error } = await supabaseAdmin
    .from('agency_clients')
    .select('*')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .single();

  if (error || !client) return null;

  // 2. Resolve plan details
  const planKey = client.plan_name || 'free';
  const planInfo: PlanDetails | undefined = PLAN_DETAILS[planKey];
  const monthlyPrice = planInfo?.price ?? 0;
  const planDisplayName = planInfo?.name ?? planKey;

  // 3. Try to find a Stripe customer for this client
  //    First check metadata, then look up by email
  const stripeCustomerId = await resolveStripeCustomerId(client);

  // 4. Build base result
  const result: ClientBillingDetails = {
    plan: planKey,
    plan_display_name: planDisplayName,
    billing_cycle: 'none',
    next_invoice_date: null,
    payment_method_last4: null,
    payment_method_brand: null,
    monthly_price: monthlyPrice,
    usage_summary: {
      videos_used: client.videos_used || 0,
      videos_quota: client.videos_quota || 0,
      storage_bytes: 0,
    },
    invoices: [],
    stripe_customer_id: stripeCustomerId,
    has_stripe: false,
  };

  // 5. Enrich with Stripe data if available
  if (stripeCustomerId) {
    await enrichWithStripeData(result, stripeCustomerId);
  }

  // 6. Get storage usage
  result.usage_summary.storage_bytes = await getClientStorageBytes(clientId);

  return result;
}

// ── Helpers ───────────────────────────────────────────────────

async function resolveStripeCustomerId(
  client: Record<string, unknown>,
): Promise<string | null> {
  // 1. Check metadata.stripe_customer_id on the agency_clients row
  const meta = client.metadata as Record<string, unknown> | null;
  if (meta?.stripe_customer_id && typeof meta.stripe_customer_id === 'string') {
    return meta.stripe_customer_id;
  }

  // 2. Look up user_subscriptions by client email → find their stripe_customer_id
  const email = client.email as string | null;
  if (!email) return null;

  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.listUsers();
    const matchedUser = authUser?.users?.find(u => u.email === email);
    if (matchedUser) {
      const { data: sub } = await supabaseAdmin
        .from('user_subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', matchedUser.id)
        .single();
      if (sub?.stripe_customer_id) return sub.stripe_customer_id;
    }
  } catch {
    // auth lookup failed — try Stripe directly
  }

  // 3. Search Stripe by email (if configured)
  const stripeClient = getStripe();
  if (!stripeClient) return null;

  try {
    const customers = await stripeClient.customers.list({ email, limit: 1 });
    if (customers.data.length > 0) {
      return customers.data[0].id;
    }
  } catch {
    // Stripe lookup failed — non-fatal
  }

  return null;
}

async function enrichWithStripeData(
  result: ClientBillingDetails,
  customerId: string,
): Promise<void> {
  const stripeClient = getStripe();
  if (!stripeClient) return;

  try {
    // Get active subscriptions
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      result.has_stripe = true;

      // Billing cycle
      const interval = sub.items.data[0]?.price?.recurring?.interval;
      result.billing_cycle = interval === 'year' ? 'annual' : 'monthly';

      // Next invoice date
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
      if (periodEnd) {
        result.next_invoice_date = new Date(periodEnd * 1000).toISOString();
      }

      // Monthly price from Stripe (override plan lookup)
      const unitAmount = sub.items.data[0]?.price?.unit_amount;
      if (unitAmount != null) {
        result.monthly_price = interval === 'year'
          ? Math.round(unitAmount / 12)
          : unitAmount;
      }
    }

    // Get default payment method
    const customer = await stripeClient.customers.retrieve(customerId) as Stripe.Customer;
    if (!customer.deleted) {
      const pmId = typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : (customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null)?.id;

      if (pmId) {
        const pm = await stripeClient.paymentMethods.retrieve(pmId);
        if (pm.card) {
          result.payment_method_last4 = pm.card.last4;
          result.payment_method_brand = pm.card.brand;
        }
      } else if (customer.default_source) {
        // Fallback to legacy source
        result.has_stripe = true;
      }
    }

    // Get recent invoices (last 10)
    const invoices = await stripeClient.invoices.list({
      customer: customerId,
      limit: 10,
    });

    result.invoices = invoices.data.map(inv => ({
      id: inv.id,
      amount: inv.amount_due,
      status: inv.status || 'unknown',
      date: new Date((inv.created || 0) * 1000).toISOString(),
      invoice_url: inv.hosted_invoice_url || null,
    }));

    if (result.invoices.length > 0) {
      result.has_stripe = true;
    }
  } catch (err) {
    console.error('[getClientBillingDetails] Stripe enrichment error:', err instanceof Error ? err.message : err);
  }
}

async function getClientStorageBytes(clientId: string): Promise<number> {
  try {
    const { data: assets } = await supabaseAdmin
      .from('video_assets')
      .select('byte_size')
      .eq('agency_client_id', clientId);

    if (!assets) return 0;
    return assets.reduce((sum, a) => sum + (a.byte_size || 0), 0);
  } catch {
    // Table may not have agency_client_id column — non-fatal
    return 0;
  }
}
