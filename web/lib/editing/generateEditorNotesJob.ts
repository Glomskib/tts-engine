/**
 * Job handler: Generate enhanced editor notes for a content item.
 *
 * Reads the transcript from the content_item, generates editor notes via Claude,
 * and stores the result back on the content_item row.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateEnhancedEditorNotes } from '@/lib/briefs/generateEditorNotes';
import type { EnhancedEditorNotesInput } from '@/lib/briefs/generateEditorNotes';

export async function generateEditorNotesForItem(
  contentItemId: string,
  workspaceId: string,
): Promise<{ status: string; timeline_segments?: number }> {
  // 1. Fetch item with transcript
  const { data: item, error } = await supabaseAdmin
    .from('content_items')
    .select('id, transcript_text, transcript_json, title, brief_selected_cow_tier, product_id, brand_id')
    .eq('id', contentItemId)
    .eq('workspace_id', workspaceId)
    .single();

  if (error || !item) {
    throw new Error(`Content item not found: ${contentItemId}`);
  }

  if (!item.transcript_text) {
    throw new Error('No transcript available for this content item');
  }

  // 2. Mark as processing
  await supabaseAdmin
    .from('content_items')
    .update({ editor_notes_status: 'processing' })
    .eq('id', contentItemId);

  // 3. Fetch product/brand context if available
  let productName: string | undefined;
  let brandName: string | undefined;
  if (item.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name, brand:brands(name)')
      .eq('id', item.product_id)
      .single();
    if (product) {
      productName = product.name;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      brandName = (product.brand as any)?.name;
    }
  }

  // 4. Generate
  const input: EnhancedEditorNotesInput = {
    transcript: item.transcript_text,
    timestamps: item.transcript_json || undefined,
    productName,
    brandName,
    cowTier: (item.brief_selected_cow_tier as 'safe' | 'edgy' | 'unhinged') || 'edgy',
    correlationId: `editor-notes-${contentItemId}`,
  };

  try {
    const result = await generateEnhancedEditorNotes(input);

    // 5. Store result
    await supabaseAdmin
      .from('content_items')
      .update({
        editor_notes_json: result.json,
        editor_notes_text: result.markdown,
        editor_notes_status: 'completed',
        editor_notes_error: null,
      })
      .eq('id', contentItemId);

    return {
      status: 'completed',
      timeline_segments: result.json.timeline?.length || 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await supabaseAdmin
      .from('content_items')
      .update({
        editor_notes_status: 'failed',
        editor_notes_error: message,
      })
      .eq('id', contentItemId);
    throw err;
  }
}
