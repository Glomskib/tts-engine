/**
 * Email Unsubscribe Utilities
 *
 * Token-based unsubscribe system for CAN-SPAM / GDPR compliance.
 * Uses a stable per-subscriber token stored in email_subscribers table.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com';

/**
 * Get or create a stable unsubscribe token for a subscriber.
 * Tokens are deterministic per email — calling twice returns the same token.
 */
export async function getOrCreateUnsubscribeToken(email: string): Promise<string | null> {
  // Check for existing token
  const { data: existing } = await supabaseAdmin
    .from('email_subscribers')
    .select('unsubscribe_token')
    .eq('email', email.toLowerCase())
    .single();

  if (existing?.unsubscribe_token) {
    return existing.unsubscribe_token;
  }

  // Generate a new token
  const token = crypto.randomBytes(32).toString('hex');

  const { error } = await supabaseAdmin
    .from('email_subscribers')
    .update({ unsubscribe_token: token })
    .eq('email', email.toLowerCase());

  if (error) {
    console.error('[unsubscribe] Failed to set token:', error);
    return null;
  }

  return token;
}

/**
 * Build the full unsubscribe URL for a given email.
 */
export async function buildUnsubscribeUrl(email: string): Promise<string | null> {
  const token = await getOrCreateUnsubscribeToken(email);
  if (!token) return null;
  return `${BASE_URL}/api/email/unsubscribe?token=${token}`;
}

/**
 * Process an unsubscribe request by token.
 * Returns true if the unsubscribe was successful.
 */
export async function processUnsubscribe(token: string): Promise<{ ok: boolean; email?: string }> {
  // Look up subscriber by token
  const { data: subscriber, error: lookupError } = await supabaseAdmin
    .from('email_subscribers')
    .select('email, unsubscribed_at')
    .eq('unsubscribe_token', token)
    .single();

  if (lookupError || !subscriber) {
    return { ok: false };
  }

  // Already unsubscribed
  if (subscriber.unsubscribed_at) {
    return { ok: true, email: subscriber.email };
  }

  // Mark as unsubscribed
  const { error: updateError } = await supabaseAdmin
    .from('email_subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token);

  if (updateError) {
    console.error('[unsubscribe] Failed to process:', updateError);
    return { ok: false };
  }

  return { ok: true, email: subscriber.email };
}

/**
 * Check if a subscriber is still subscribed (not unsubscribed).
 */
export async function isSubscribed(email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('email_subscribers')
    .select('unsubscribed_at')
    .eq('email', email.toLowerCase())
    .single();

  // If no record found, consider them subscribed (new subscriber)
  if (!data) return true;

  return !data.unsubscribed_at;
}
