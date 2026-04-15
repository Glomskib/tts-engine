/**
 * GET /api/public/demo
 *
 * Returns realistic mock data for the demo page.
 * No auth required. No real data exposed.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function minsAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

export async function GET() {
  const demo = {
    system_status: 'working' as const,
    completed_today: 5,
    failed_today: 0,
    todays_wins: [
      {
        title: 'Published 12 TikTok product videos',
        completed_at: minsAgo(15),
        proof_summary: 'Batch #47 — 12 videos rendered and uploaded to TikTok Shop. Avg 42s each.',
        lane: 'Content Ops',
      },
      {
        title: 'Synced Shopify inventory to all channels',
        completed_at: minsAgo(45),
        proof_summary: '847 SKUs synced. 3 price updates applied. Zero conflicts.',
        lane: 'E-Commerce',
      },
      {
        title: 'Sent weekly sponsor outreach batch',
        completed_at: hoursAgo(1),
        proof_summary: '14 personalized emails sent. 3 follow-ups scheduled for Thursday.',
        lane: 'Growth',
      },
      {
        title: 'Generated daily analytics report',
        completed_at: hoursAgo(2),
        proof_summary: 'Revenue up 12% WoW. Top performer: Vitamin D bundle (+340 units).',
        lane: 'Analytics',
      },
      {
        title: 'Processed customer support queue',
        completed_at: hoursAgo(3),
        proof_summary: '23 tickets resolved. Avg response time: 4 minutes. 0 escalations.',
        lane: 'Support',
      },
    ],
    simple_lane_summary: [
      { lane: 'Content Ops', completed_today: 2, active: 1, issues: 0 },
      { lane: 'E-Commerce', completed_today: 1, active: 1, issues: 0 },
      { lane: 'Growth', completed_today: 1, active: 0, issues: 1 },
      { lane: 'Analytics', completed_today: 1, active: 0, issues: 0 },
      { lane: 'Support', completed_today: 0, active: 1, issues: 0 },
    ],
    active_issue: {
      lane: 'Growth',
      message: 'Sponsor outreach follow-up sequence paused — waiting on approved messaging',
    },
  };

  return NextResponse.json({ ok: true, data: demo }, {
    headers: { 'Cache-Control': 'public, max-age=5, s-maxage=5' },
  });
}
