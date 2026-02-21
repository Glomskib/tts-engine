/**
 * Outlook email sync — fetches messages from Graph API, matches to contacts/deals,
 * and inserts crm_activities with dedup on source_id (Outlook message ID).
 */
import { getOutlookAccessToken, getOutlookConfig } from './outlook-config';
import { findOrCreateContactByEmail, createDealActivity } from './crm-ingest';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  from: { emailAddress: { address: string; name: string } };
  receivedDateTime: string;
}

export async function syncOutlookEmails(): Promise<{ processed: number; created: number; skipped: number }> {
  const config = getOutlookConfig();
  const accessToken = await getOutlookAccessToken();

  let processed = 0;
  let created = 0;
  let skipped = 0;

  // Build filter for watched senders
  const senderFilters = config.watchedSenders
    .map((email) => `from/emailAddress/address eq '${email}'`)
    .join(' or ');

  const filterParam = senderFilters
    ? `&$filter=${encodeURIComponent(senderFilters)}`
    : '';

  const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,receivedDateTime${filterParam}`;

  const res = await fetch(graphUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API fetch failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const messages: GraphMessage[] = json.value || [];

  for (const msg of messages) {
    processed++;
    const sourceId = `outlook:${msg.id}`;

    // Dedup check
    const { data: existing } = await supabaseAdmin
      .from('crm_activities')
      .select('id')
      .eq('source_id', sourceId)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    // Match or create contact
    const senderEmail = msg.from.emailAddress.address.toLowerCase();
    const contact = await findOrCreateContactByEmail(
      senderEmail,
      msg.from.emailAddress.name,
      'outlook',
    );

    // Try to find an active deal for this contact
    let dealId: string | null = null;
    if (contact) {
      const { data: deal } = await supabaseAdmin
        .from('crm_deals')
        .select('id')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (deal) dealId = deal.id;
    }

    await createDealActivity({
      deal_id: dealId,
      contact_id: contact?.id ?? null,
      activity_type: 'email_in',
      subject: msg.subject || '(no subject)',
      body: msg.bodyPreview || '',
      source_id: sourceId,
      actor: 'outlook-sync',
      meta: { received_at: msg.receivedDateTime, sender: senderEmail },
    });

    created++;
  }

  return { processed, created, skipped };
}
