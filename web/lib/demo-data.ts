/**
 * Demo data for ops-summary.
 * Used as fallback when no real operational data exists,
 * and by the public demo endpoint.
 */

function minsAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

export function getDemoOpsSummary() {
  const now = new Date().toISOString();

  return {
    system_health: {
      verdict: 'degraded' as const,
      reason: '1 revenue-critical task blocked, 2 stale tasks detected',
      signals: ['blocked_revenue', 'stale_tasks_detected', 'agents_producing'],
    },
    insights: [
      {
        id: 'demo-1',
        severity: 'critical' as const,
        message: 'Revenue-critical task blocked: Spring promo campaign waiting on creative assets for 48h',
        lane: 'Growth',
        action: 'Unblock or reassign immediately',
      },
      {
        id: 'demo-2',
        severity: 'warning' as const,
        message: 'Inventory sync agent has not sent heartbeat in 3+ hours',
        lane: 'E-Commerce',
        action: 'Reclaim and restart task',
      },
      {
        id: 'demo-3',
        severity: 'info' as const,
        message: '5 tasks completed with proof today — system is producing',
        lane: null,
        action: null,
      },
    ],
    morning_brief: {
      overnight_failures: [
        { id: 'f1', agent_id: 'sync-agent', action: 'inventory_sync', error: 'Connection timeout', ts: hoursAgo(6) },
      ],
      stale_items: [
        { id: 's1', title: 'Sync inventory to Shopify', assigned_agent: 'sync-agent', lane: 'E-Commerce', status: 'active', stale_since_minutes: 180, is_revenue_critical: false, priority: 1 },
        { id: 's2', title: 'Run nightly cost anomaly check', assigned_agent: 'ops-agent', lane: 'Operations', status: 'active', stale_since_minutes: 360, is_revenue_critical: false, priority: 3 },
      ],
      top_priorities: [
        { id: 'p1', title: 'Launch spring promo campaign', lane: 'Growth', priority: 1, is_revenue_critical: true },
        { id: 'p2', title: 'Publish TikTok content batch', lane: 'Content Ops', priority: 2, is_revenue_critical: false },
      ],
      sessions_needing_refresh: [],
      agents_no_proof_since_yesterday: ['sync-agent'],
    },
    needs_me_count: 4,
    intervention_queue: [
      {
        id: 'iq1',
        title: 'Inventory sync stalled',
        description: 'Sync agent has not sent heartbeat in 3+ hours. Product counts may be drifting.',
        severity: 'critical',
        category: 'stale_task',
        source_type: 'task',
        source_id: 's1',
        lane: 'E-Commerce',
        status: 'open',
        created_at: hoursAgo(3),
      },
      {
        id: 'iq2',
        title: 'Spring promo blocked on creative',
        description: 'Revenue-critical campaign waiting 48h on design team assets.',
        severity: 'high',
        category: 'blocked_revenue',
        source_type: 'task',
        source_id: 'b1',
        lane: 'Growth',
        status: 'open',
        created_at: hoursAgo(24),
      },
    ],
    lane_summaries: [
      { lane: 'Content Ops', queued: 3, executing: 1, stale: 0, blocked: 0, completed_today: 2, failed_today: 0, last_meaningful_action: minsAgo(15) },
      { lane: 'E-Commerce', queued: 1, executing: 0, stale: 1, blocked: 0, completed_today: 1, failed_today: 0, last_meaningful_action: hoursAgo(3) },
      { lane: 'Growth', queued: 2, executing: 0, stale: 0, blocked: 1, completed_today: 1, failed_today: 0, last_meaningful_action: hoursAgo(1) },
      { lane: 'Analytics', queued: 0, executing: 0, stale: 0, blocked: 0, completed_today: 1, failed_today: 0, last_meaningful_action: hoursAgo(2) },
      { lane: 'Support', queued: 1, executing: 1, stale: 1, blocked: 0, completed_today: 0, failed_today: 0, last_meaningful_action: hoursAgo(6) },
    ],
    agent_effectiveness: [
      { agent_id: 'content-agent', effective_status: 'producing' as const, current_task: 'Generate TikTok batch #47', current_task_id: 'ct1', last_heartbeat: minsAgo(2), last_proof: minsAgo(15), completed_today: 2, failed_today: 0, stale_count: 0, avg_cycle_time_minutes: 25, health_score: 92 },
      { agent_id: 'growth-agent', effective_status: 'producing' as const, current_task: 'Draft sponsor outreach', current_task_id: 'gt1', last_heartbeat: minsAgo(10), last_proof: hoursAgo(1), completed_today: 1, failed_today: 0, stale_count: 0, avg_cycle_time_minutes: 45, health_score: 78 },
      { agent_id: 'ops-agent', effective_status: 'producing' as const, current_task: 'Deploy pipeline v2', current_task_id: 'ot1', last_heartbeat: minsAgo(5), last_proof: minsAgo(45), completed_today: 1, failed_today: 0, stale_count: 1, avg_cycle_time_minutes: 60, health_score: 70 },
      { agent_id: 'sync-agent', effective_status: 'failing' as const, current_task: 'Sync inventory', current_task_id: 's1', last_heartbeat: hoursAgo(3), last_proof: hoursAgo(8), completed_today: 0, failed_today: 3, stale_count: 1, avg_cycle_time_minutes: null, health_score: 18 },
      { agent_id: 'support-agent', effective_status: 'idle' as const, current_task: null, current_task_id: null, last_heartbeat: hoursAgo(1), last_proof: hoursAgo(4), completed_today: 1, failed_today: 0, stale_count: 0, avg_cycle_time_minutes: 30, health_score: 60 },
    ],
    stale_tasks: [
      { id: 's1', title: 'Sync inventory to Shopify', assigned_agent: 'sync-agent', lane: 'E-Commerce', status: 'active', stale_since_minutes: 180, is_revenue_critical: false, priority: 1 },
      { id: 's2', title: 'Run nightly cost anomaly check', assigned_agent: 'ops-agent', lane: 'Operations', status: 'active', stale_since_minutes: 360, is_revenue_critical: false, priority: 3 },
    ],
    blocked_tasks: [
      { id: 'b1', title: 'Launch spring promo campaign', assigned_agent: 'growth-agent', lane: 'Growth', blocked_reason: 'Waiting on design team creative assets', is_revenue_critical: true, priority: 1 },
    ],
    proofless_completions: [
      { id: 'pc1', title: 'Review onboarding copy' },
    ],
    todays_wins: [
      { id: 'w1', title: 'Published 12 TikTok product videos', lane: 'Content Ops', completed_at: minsAgo(15), proof_summary: 'Batch #47 — 12 videos rendered and uploaded. Avg 42s each.', proof_url: null, assigned_agent: 'content-agent' },
      { id: 'w2', title: 'Synced Shopify inventory to all channels', lane: 'E-Commerce', completed_at: minsAgo(45), proof_summary: '847 SKUs synced. 3 price updates applied. Zero conflicts.', proof_url: null, assigned_agent: 'ops-agent' },
      { id: 'w3', title: 'Sent weekly sponsor outreach batch', lane: 'Growth', completed_at: hoursAgo(1), proof_summary: '14 personalized emails sent. 3 follow-ups scheduled.', proof_url: null, assigned_agent: 'growth-agent' },
      { id: 'w4', title: 'Generated daily analytics report', lane: 'Analytics', completed_at: hoursAgo(2), proof_summary: 'Revenue up 12% WoW. Top performer: Vitamin D bundle (+340 units).', proof_url: null, assigned_agent: 'ops-agent' },
      { id: 'w5', title: 'Processed customer support queue', lane: 'Support', completed_at: hoursAgo(3), proof_summary: '23 tickets resolved. Avg response time: 4 minutes. 0 escalations.', proof_url: null, assigned_agent: 'support-agent' },
    ],
    trust_signals: {
      proof_backed_completion_pct: 80,
      stale_recovery_pct: 65,
      avg_time_to_claim_minutes: 8,
      avg_time_to_complete_minutes: 35,
      blocked_resolved_rate_pct: 50,
    },
    integration_health: [
      { service_name: 'TikTok Session', status: 'down', last_check_at: minsAgo(5), last_success_at: hoursAgo(4), last_error: 'Session expired — re-authentication required', error_count_24h: 24 },
      { service_name: 'Shopify API', status: 'healthy', last_check_at: minsAgo(3), last_success_at: minsAgo(3), last_error: null, error_count_24h: 2 },
      { service_name: 'HeyGen API', status: 'degraded', last_check_at: minsAgo(10), last_success_at: hoursAgo(2), last_error: 'Rate limit exceeded (429)', error_count_24h: 15 },
      { service_name: 'Supabase', status: 'healthy', last_check_at: minsAgo(1), last_success_at: minsAgo(1), last_error: null, error_count_24h: 0 },
    ],
    kpis: {
      human_actions_needed: 4,
      stale_jobs: 2,
      blocked_revenue_jobs: 1,
      completed_today: 5,
      failed_today: 0,
      auto_heals_today: 1,
    },
    system_alive_but_ineffective: false,
    fetched_at: now,
  };
}
