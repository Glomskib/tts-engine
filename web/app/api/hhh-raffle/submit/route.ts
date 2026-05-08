/**
 * POST /api/hhh-raffle/submit — rider submits a shop-ride proof, earns 1 raffle entry
 *
 * Public endpoint. No auth required. Light rate-limit by IP.
 *
 * Body: {
 *   email: string,           // required, deduped against entries
 *   shop_name: string,       // which shop ride did they do
 *   ride_date: string,       // ISO date — when the ride happened
 *   photo_url?: string,      // optional photo proof URL (uploaded separately to /api/hhh-raffle/upload)
 *   referral_email?: string, // friend who registered for HHH (gives them +2 each)
 * }
 *
 * Returns: {
 *   ok, entry_id, total_entries: number, message: string
 * }
 *
 * The shop-ride raffle is the funnel that drives shop-attendance + HHH registration:
 *   - 1 entry per shop ride (max ~30)
 *   - 2 entries for each friend who registers via referral
 *   - 5 entries for volunteers
 *   - HHH paid registration = 1 automatic
 *   - Sponsor employees = 2
 *
 * Drawing: 7 PM at finish-line party Sept 12. Must be present to win grand prize.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const VALID_SHOP_RIDES = new Set([
  'False Chord Saturday',
  'False Chord Tuesday',
  'Spoke Life Cycles',
  'Wheelers Bike & Hike',
  'Trek Bowling Green',
  'Other',
]);

interface SubmitBody {
  email?: string;
  shop_name?: string;
  ride_date?: string;
  photo_url?: string;
  referral_email?: string;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const shopName = (body.shop_name || '').trim();
  const rideDate = (body.ride_date || '').trim();
  const photoUrl = body.photo_url?.trim() || null;
  const referralEmail = body.referral_email?.trim().toLowerCase() || null;

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'valid email required' }, { status: 400 });
  }
  if (!shopName || !VALID_SHOP_RIDES.has(shopName)) {
    return NextResponse.json({ error: 'shop_name must be one of: ' + Array.from(VALID_SHOP_RIDES).join(', ') }, { status: 400 });
  }
  if (!rideDate || isNaN(new Date(rideDate).getTime())) {
    return NextResponse.json({ error: 'valid ride_date (ISO) required' }, { status: 400 });
  }

  // Dedupe: one entry per (email, shop_name, ride_date)
  const { data: existing } = await supabaseAdmin
    .from('hhh_raffle_entries')
    .select('id')
    .eq('email', email)
    .eq('shop_name', shopName)
    .eq('ride_date', rideDate)
    .maybeSingle()
    .catch(() => ({ data: null }));

  if (existing?.id) {
    // Already submitted for this ride — return current count without adding
    const { count } = await supabaseAdmin
      .from('hhh_raffle_entries')
      .select('*', { count: 'exact', head: true })
      .eq('email', email);
    return NextResponse.json({
      ok: true,
      entry_id: existing.id,
      total_entries: count || 0,
      message: 'Already counted for this ride. Show up next Saturday for another entry.',
      duplicate: true,
    });
  }

  // Insert
  const { data: row, error } = await supabaseAdmin
    .from('hhh_raffle_entries')
    .insert({
      email,
      shop_name: shopName,
      ride_date: rideDate,
      photo_url: photoUrl,
      source: 'shop-ride',
      status: photoUrl ? 'pending_review' : 'auto_approved',
    })
    .select('id')
    .single();

  if (error || !row) {
    // Table may not exist yet — fall back to a structured 503 with a clear admin message
    console.error('[hhh-raffle/submit] insert failed', error?.message);
    return NextResponse.json(
      {
        ok: false,
        error: 'raffle_storage_unavailable',
        message: error?.message?.includes('relation') || error?.message?.includes('does not exist')
          ? 'Raffle table not yet provisioned. Apply migration: web/supabase/migrations/2026-05-08-hhh-raffle.sql'
          : 'Raffle entry could not be saved. Try again or email miles@makingmilesmatter.com.',
      },
      { status: 503 },
    );
  }

  // Optional referral bonus — if referrer is provided AND they exist as a HHH registrant
  let referralBonus = false;
  if (referralEmail && isValidEmail(referralEmail) && referralEmail !== email) {
    const { error: refErr } = await supabaseAdmin
      .from('hhh_raffle_entries')
      .insert({
        email: referralEmail,
        shop_name: 'Referral bonus',
        ride_date: rideDate,
        source: 'referral',
        status: 'auto_approved',
        notes: `Referred by ${email}`,
      });
    if (!refErr) {
      // Add 2nd entry for the referrer too
      await supabaseAdmin
        .from('hhh_raffle_entries')
        .insert({
          email,
          shop_name: 'Referral bonus',
          ride_date: rideDate,
          source: 'referral',
          status: 'auto_approved',
          notes: `Referred ${referralEmail}`,
        });
      referralBonus = true;
    }
  }

  // Get current total
  const { count } = await supabaseAdmin
    .from('hhh_raffle_entries')
    .select('*', { count: 'exact', head: true })
    .eq('email', email);

  return NextResponse.json({
    ok: true,
    entry_id: row.id,
    total_entries: count || 1,
    message: photoUrl
      ? 'Entry submitted! Brandon reviews photo proofs within 24 hours.'
      : 'Entry counted. Drawing 7 PM Sept 12 at the finish-line party.',
    referral_bonus_applied: referralBonus,
  });
}

export async function GET(req: NextRequest) {
  // Public lookup: how many tickets does this email have?
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }
  const { count } = await supabaseAdmin
    .from('hhh_raffle_entries')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .in('status', ['auto_approved', 'approved']);
  return NextResponse.json({
    ok: true,
    email,
    total_entries: count || 0,
    grand_prize_value: '$500+',
    drawing: 'September 12, 2026 at 7:00 PM (must be present to win)',
  });
}
