// POST /api/video-service/inquiry - Submit video service inquiry
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { sendEmailWithAudit, getAdminEmailRecipient } from '@/lib/email';

export const runtime = 'nodejs';

const InquirySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  company: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  videos_per_month: z.string().max(50).optional(),
  budget_range: z.string().max(50).optional(),
  content_types: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
  source: z.string().max(50).optional(),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = InquirySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        ok: false,
        error: 'Validation failed',
        issues: parsed.error.issues,
      }, { status: 400 });
    }

    const { data: inquiry, error } = await supabaseAdmin
      .from('video_service_inquiries')
      .insert({
        name: parsed.data.name,
        email: parsed.data.email,
        company: parsed.data.company || null,
        phone: parsed.data.phone || null,
        videos_per_month: parsed.data.videos_per_month || null,
        budget_range: parsed.data.budget_range || null,
        content_types: parsed.data.content_types || [],
        notes: parsed.data.notes || null,
        source: parsed.data.source || 'landing_page',
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create inquiry:', error);
      return NextResponse.json({ ok: false, error: 'Failed to submit inquiry' }, { status: 500 });
    }

    // Send notification email to sales team (non-blocking)
    const adminEmail = getAdminEmailRecipient();
    if (adminEmail) {
      sendEmailWithAudit(supabaseAdmin, {
        to: adminEmail,
        subject: `New Video Service Inquiry from ${parsed.data.name}`,
        templateKey: 'video_service_inquiry_admin',
        html: `
          <h2>New Video Service Inquiry</h2>
          <p><strong>Name:</strong> ${parsed.data.name}</p>
          <p><strong>Email:</strong> ${parsed.data.email}</p>
          ${parsed.data.company ? `<p><strong>Company:</strong> ${parsed.data.company}</p>` : ''}
          ${parsed.data.phone ? `<p><strong>Phone:</strong> ${parsed.data.phone}</p>` : ''}
          ${parsed.data.videos_per_month ? `<p><strong>Videos/Month:</strong> ${parsed.data.videos_per_month}</p>` : ''}
          ${parsed.data.budget_range ? `<p><strong>Budget:</strong> ${parsed.data.budget_range}</p>` : ''}
          ${parsed.data.notes ? `<p><strong>Notes:</strong> ${parsed.data.notes}</p>` : ''}
        `,
        context: { inquiry_id: inquiry.id },
      }).catch((err) => console.error('Failed to send admin notification:', err));
    }

    // Send confirmation email to user (non-blocking)
    sendEmailWithAudit(supabaseAdmin, {
      to: parsed.data.email,
      subject: 'We received your video service inquiry',
      templateKey: 'video_service_inquiry_confirmation',
      html: `
        <h2>Thanks for reaching out, ${parsed.data.name}!</h2>
        <p>We've received your inquiry about our video production services. A member of our team will be in touch within 24 hours.</p>
        <p>In the meantime, feel free to reply to this email with any additional details.</p>
        <p>Best,<br>The FlashFlow AI Team</p>
      `,
      context: { inquiry_id: inquiry.id },
    }).catch((err) => console.error('Failed to send confirmation email:', err));

    return NextResponse.json({
      ok: true,
      message: 'Thank you! We\'ll be in touch within 24 hours.',
      inquiry_id: inquiry.id,
    });
  } catch (err) {
    console.error('Inquiry submission error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
