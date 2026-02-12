import { processMonthlyPayouts } from '@/lib/affiliates';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/cron/process-payouts
 * Runs on the 1st of every month via Vercel cron.
 * Processes affiliate payouts via Stripe Connect transfers.
 */
export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await processMonthlyPayouts();

    console.info(
      `[process-payouts] Processed ${results.processed} payouts, total $${results.totalPaid.toFixed(2)}`,
      results.errors.length > 0 ? `Errors: ${results.errors.join('; ')}` : '',
    );

    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (err) {
    console.error('[process-payouts] Fatal error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
