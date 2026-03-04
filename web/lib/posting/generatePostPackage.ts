/**
 * Post Package Generator
 *
 * Assembles a structured JSON + markdown bundle for manual posting (VA/OpenClaw).
 * Pure DB assembly — no AI call.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface PostPackage {
  content_item_id: string;
  workspace_id: string;
  platform: string;
  scheduled_at: string | null;
  caption: string | null;
  hashtags: string[] | null;
  cta: string | null;
  drive_folder_url: string | null;
  raw_footage_url: string | null;
  final_video_url: string | null;
  product_id: string | null;
  product_name: string | null;
  product_url: string | null;
  tiktok_showcase_url: string | null;
  experiment_tags: Array<{ type: string; variant: string }>;
  recommended_hook: { pattern: string; example: string | null; score: number } | null;
  steps: string[];
  generated_at: string;
}

export async function generatePostPackage(
  contentItemId: string,
  workspaceId: string,
  platform = 'tiktok',
): Promise<{ json: PostPackage; markdown: string }> {
  // 1. Load content item
  const { data: item, error: itemErr } = await supabaseAdmin
    .from('content_items')
    .select('id, title, caption, hashtags, final_video_url, drive_folder_url, raw_footage_url, transcript_text, product_id')
    .eq('id', contentItemId)
    .eq('workspace_id', workspaceId)
    .single();

  if (itemErr || !item) {
    throw new Error('Content item not found');
  }

  // 2. Load product if linked
  let product: { name: string; product_url: string | null; tiktok_showcase_url: string | null } | null = null;
  if (item.product_id) {
    const { data: p } = await supabaseAdmin
      .from('products')
      .select('name, link, tiktok_showcase_url')
      .eq('id', item.product_id)
      .single();
    if (p) {
      product = { name: p.name, product_url: p.link ?? null, tiktok_showcase_url: p.tiktok_showcase_url ?? null };
    }
  }

  // 3. Load experiments
  const { data: experiments } = await supabaseAdmin
    .from('content_experiments')
    .select('variable_type, variant')
    .eq('content_item_id', contentItemId)
    .eq('workspace_id', workspaceId);

  const experimentTags = (experiments || []).map(e => ({
    type: e.variable_type,
    variant: e.variant,
  }));

  // 4. Load top hook pattern
  let recommendedHook: PostPackage['recommended_hook'] = null;
  const { data: hook } = await supabaseAdmin
    .from('hook_patterns')
    .select('pattern, example_hook, performance_score')
    .eq('workspace_id', workspaceId)
    .order('performance_score', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (hook) {
    recommendedHook = {
      pattern: hook.pattern,
      example: hook.example_hook ?? null,
      score: hook.performance_score,
    };
  }

  // 5. Load brief for CTA if exists
  let cta: string | null = null;
  const { data: brief } = await supabaseAdmin
    .from('creator_briefs')
    .select('data')
    .eq('content_item_id', contentItemId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (brief?.data && typeof brief.data === 'object') {
    const briefData = brief.data as Record<string, unknown>;
    if (typeof briefData.cta === 'string') {
      cta = briefData.cta;
    }
  }

  const generatedAt = new Date().toISOString();

  // 6. Build steps
  const steps: string[] = [];
  if (item.final_video_url) steps.push(`Open final video: ${item.final_video_url}`);
  steps.push('Open TikTok and start new post');
  if (item.drive_folder_url) steps.push(`Upload video from Drive folder: ${item.drive_folder_url}`);
  if (item.caption) steps.push('Paste caption (copied below)');
  if (item.hashtags?.length) steps.push(`Add hashtags: ${item.hashtags.join(' ')}`);
  if (product?.name) {
    const showcaseNote = product.tiktok_showcase_url ? ` — ${product.tiktok_showcase_url}` : '';
    steps.push(`Link product in TikTok Shop: ${product.name}${showcaseNote}`);
  }
  steps.push('Set to public, post now (or schedule)');
  steps.push('Copy posted URL back into FlashFlow');

  // 7. Build payload
  const json: PostPackage = {
    content_item_id: contentItemId,
    workspace_id: workspaceId,
    platform,
    scheduled_at: null,
    caption: item.caption,
    hashtags: item.hashtags,
    cta,
    drive_folder_url: item.drive_folder_url,
    raw_footage_url: item.raw_footage_url,
    final_video_url: item.final_video_url,
    product_id: item.product_id,
    product_name: product?.name ?? null,
    product_url: product?.product_url ?? null,
    tiktok_showcase_url: product?.tiktok_showcase_url ?? null,
    experiment_tags: experimentTags,
    recommended_hook: recommendedHook,
    steps,
    generated_at: generatedAt,
  };

  // 8. Build markdown
  const lines: string[] = [
    `# Post Package — ${item.title || contentItemId}`,
    `Generated: ${generatedAt}`,
    '',
    '## Steps',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
  ];

  if (item.caption) {
    lines.push('## Caption', '```', item.caption, '```', '');
  }
  if (item.hashtags?.length) {
    lines.push('## Hashtags', item.hashtags.join(' '), '');
  }
  if (product?.name) {
    lines.push('## Product', `- Name: ${product.name}`);
    if (product.product_url) lines.push(`- URL: ${product.product_url}`);
    if (product.tiktok_showcase_url) lines.push(`- TikTok Showcase: ${product.tiktok_showcase_url}`);
    lines.push('');
  }
  if (experimentTags.length) {
    lines.push('## Experiments', ...experimentTags.map(e => `- ${e.type}: ${e.variant}`), '');
  }
  if (recommendedHook) {
    lines.push('## Recommended Hook', `- Pattern: ${recommendedHook.pattern}`);
    if (recommendedHook.example) lines.push(`- Example: ${recommendedHook.example}`);
    lines.push(`- Score: ${recommendedHook.score}`, '');
  }

  return { json, markdown: lines.join('\n') };
}
