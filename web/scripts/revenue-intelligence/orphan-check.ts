#!/usr/bin/env npx tsx
// @ts-nocheck
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  // Orphan check 1: reply_drafts → comments
  const { data: drafts } = await supabase.from('ri_reply_drafts').select('comment_id').limit(500);
  const draftCommentIds = Array.from(new Set((drafts ?? []).map((d) => d.comment_id)));

  let orphanDrafts = 0;
  if (draftCommentIds.length > 0) {
    const { data: validComments } = await supabase.from('ri_comments').select('id').in('id', draftCommentIds);
    const validIds = new Set((validComments ?? []).map((c) => c.id));
    const orphans = draftCommentIds.filter(id => !validIds.has(id));
    orphanDrafts = orphans.length;
    if (orphans.length > 0) {
      console.log('Draft orphan IDs:', orphans.slice(0, 10));
    }
  }
  console.log('Reply draft orphans:', orphanDrafts);

  // Orphan check 2: analysis → comments
  const { data: analyses } = await supabase.from('ri_comment_analysis').select('comment_id').limit(500);
  const analysisCommentIds = Array.from(new Set((analyses ?? []).map((a) => a.comment_id)));

  let orphanAnalysis = 0;
  if (analysisCommentIds.length > 0) {
    const { data: validComments2 } = await supabase.from('ri_comments').select('id').in('id', analysisCommentIds);
    const validIds2 = new Set((validComments2 ?? []).map((c) => c.id));
    const orphans2 = analysisCommentIds.filter(id => !validIds2.has(id));
    orphanAnalysis = orphans2.length;
    if (orphans2.length > 0) {
      console.log('Analysis orphan IDs:', orphans2.slice(0, 10));
    }
  }
  console.log('Analysis orphans:', orphanAnalysis);

  // Counts
  const { count: commentCount } = await supabase.from('ri_comments').select('*', { count: 'exact', head: true });
  const { count: draftCount } = await supabase.from('ri_reply_drafts').select('*', { count: 'exact', head: true });
  const { count: analysisCount } = await supabase.from('ri_comment_analysis').select('*', { count: 'exact', head: true });
  console.log('\nTotals:');
  console.log('  Comments:', commentCount);
  console.log('  Drafts:', draftCount);
  console.log('  Analyses:', analysisCount);
}

main().catch(e => { console.error(e); process.exit(1); });
