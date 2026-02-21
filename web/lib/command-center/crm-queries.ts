/**
 * CRM Pipeline – Server-side query helpers.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { PipelineAnalytics, StageAnalytics, DealWithContact, PipelineStage } from './crm-types';

/**
 * Get all deals for a pipeline with contact join, sorted by stage position then sort_order.
 */
export async function getDealsByPipeline(pipelineId: string): Promise<DealWithContact[]> {
  const { data, error } = await supabaseAdmin
    .from('crm_deals')
    .select('*, crm_contacts(id, name, email, company)')
    .eq('pipeline_id', pipelineId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[crm-queries] getDealsByPipeline failed:', error.message);
    return [];
  }

  return (data || []) as DealWithContact[];
}

/**
 * Compute analytics for a pipeline: per-stage counts, values, avg days, conversion rates.
 */
export async function getPipelineAnalytics(pipelineId: string): Promise<PipelineAnalytics | null> {
  // Fetch pipeline
  const { data: pipeline, error: pipeErr } = await supabaseAdmin
    .from('crm_pipelines')
    .select('*')
    .eq('id', pipelineId)
    .single();

  if (pipeErr || !pipeline) {
    console.error('[crm-queries] getPipelineAnalytics pipeline not found:', pipeErr?.message);
    return null;
  }

  const stages = pipeline.stages as PipelineStage[];

  // Fetch all deals
  const { data: deals, error: dealsErr } = await supabaseAdmin
    .from('crm_deals')
    .select('stage_key, value_cents, probability, stage_entered_at')
    .eq('pipeline_id', pipelineId);

  if (dealsErr) {
    console.error('[crm-queries] getPipelineAnalytics deals query failed:', dealsErr.message);
    return null;
  }

  const allDeals = deals || [];
  const now = Date.now();

  // Build per-stage analytics
  const stageAnalytics: StageAnalytics[] = stages.map((stage) => {
    const stageDeals = allDeals.filter((d) => d.stage_key === stage.key);
    const count = stageDeals.length;
    const totalValue = stageDeals.reduce((sum, d) => sum + d.value_cents, 0);
    const avgDays = count > 0
      ? stageDeals.reduce((sum, d) => {
          const entered = new Date(d.stage_entered_at).getTime();
          return sum + (now - entered) / 86400000;
        }, 0) / count
      : 0;

    return {
      key: stage.key,
      label: stage.label,
      color: stage.color,
      deal_count: count,
      total_value_cents: totalValue,
      avg_days_in_stage: Math.round(avgDays * 10) / 10,
    };
  });

  // Conversion rates between consecutive stages
  const conversionRates: { from: string; to: string; rate: number }[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const fromCount = stageAnalytics[i].deal_count;
    // "Converted" = deals at this stage or any later stage
    const laterKeys = new Set(stages.slice(i + 1).map((s) => s.key));
    const toCount = allDeals.filter((d) => laterKeys.has(d.stage_key)).length;
    const total = fromCount + toCount;
    conversionRates.push({
      from: stages[i].key,
      to: stages[i + 1].key,
      rate: total > 0 ? Math.round((toCount / total) * 100) : 0,
    });
  }

  const totalValue = allDeals.reduce((sum, d) => sum + d.value_cents, 0);
  const weightedValue = allDeals.reduce(
    (sum, d) => sum + Math.round(d.value_cents * (d.probability / 100)),
    0,
  );

  return {
    pipeline_id: pipelineId,
    pipeline_name: pipeline.name,
    stages: stageAnalytics,
    conversion_rates: conversionRates,
    total_value_cents: totalValue,
    weighted_value_cents: weightedValue,
    total_deals: allDeals.length,
  };
}
