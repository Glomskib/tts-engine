import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use resend.dev domain until custom domain is verified
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'FlashFlow AI <onboarding@resend.dev>';

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  tags,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not configured, skipping send');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      replyTo: replyTo || 'support@flashflowai.com',
      tags,
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
