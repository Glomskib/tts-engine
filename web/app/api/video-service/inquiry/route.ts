// POST /api/video-service/inquiry - Submit video service inquiry
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { z } from 'zod';

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

    // TODO: Send notification email to sales team
    // TODO: Send confirmation email to user

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
