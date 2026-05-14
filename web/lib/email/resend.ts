import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// Verified domain preferred — `onboarding@resend.dev` fails DMARC alignment
// and tanks deliverability. Set RESEND_FROM_EMAIL in Vercel to the
// verified flashflowai.com sender once SPF/DKIM are in place. The fallback
// stays on resend.dev so transactional mail still attempts to send during
// the DNS-setup window, but expect spam-foldering until the override lands.
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'FlashFlow AI <noreply@flashflowai.com>';

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  tags,
  headers,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  headers?: Record<string, string>;
}) {
  const resend = getResend();

  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured, skipping send');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      replyTo: replyTo || 'miles@makingmilesmatter.com',
      tags,
      headers,
    });
    if (error) {
      console.error('[email] Resend error:', error);
      return { success: false, error };
    }
    return { success: true, id: data?.id };
  } catch (error) {
    console.error('[email] Send failed:', error);
    return { success: false, error };
  }
}
