/**
 * Lead Magnet Email Capture
 * POST /api/lead-magnet
 * Public endpoint (no auth required)
 *
 * Captures email, stores subscriber, queues lead_magnet email sequence.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { queueEmailSequence } from '@/lib/email/scheduler';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email, name } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { ok: false, message: 'Valid email is required' },
        { status: 400 },
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = (name || '').trim() || trimmedEmail.split('@')[0];

    // Upsert subscriber (idempotent — re-submitting doesn't error)
    const { error: subError } = await supabaseAdmin
      .from('email_subscribers')
      .upsert(
        {
          email: trimmedEmail,
          name: trimmedName,
          source: 'lead_magnet',
          subscribed: true,
        },
        { onConflict: 'email' },
      );

    if (subError) {
      console.error('[lead-magnet] Subscriber upsert error:', subError);
      // Continue anyway — email capture is the priority
    }

    // Queue lead magnet email sequence
    try {
      await queueEmailSequence(trimmedEmail, trimmedName, 'lead_magnet', {
        downloadUrl: process.env.LEAD_MAGNET_PDF_URL || 'https://flashflowai.com/free-scripts',
      });
    } catch (e) {
      console.error('[lead-magnet] Email queue error (non-fatal):', e);
    }

    return NextResponse.json({
      ok: true,
      message: 'Check your email for the download link!',
      downloadUrl: process.env.LEAD_MAGNET_PDF_URL || null,
    });
  } catch (error) {
    console.error('[lead-magnet] Error:', error);
    return NextResponse.json(
      { ok: false, message: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
