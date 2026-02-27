/**
 * Overlay Clip Index — Analyze Pipeline
 *
 * Picks unanalyzed candidates from ff_clip_candidates,
 * fetches transcripts, scores them, and publishes to ff_clip_index
 * if they pass the publish gates.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClipRules } from './rules-parser';
import { fetchClipTranscript } from './transcript';
import { scoreCandidate, isHardReject } from './scoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyzeResult {
  analyzed: number;
  published: number;
  skipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const BATCH_SIZE = 5; // conservative to stay within serverless timeout

export async function runAnalysis(): Promise<AnalyzeResult> {
  const errors: string[] = [];
  let analyzed = 0;
  let published = 0;
  let skipped = 0;

  // Fetch candidates in 'new' status (FIFO)
  const { data: candidates, error: fetchErr } = await supabaseAdmin
    .from('ff_clip_candidates')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    return { analyzed: 0, published: 0, skipped: 0, errors: [`Fetch candidates: ${fetchErr.message}`] };
  }

  if (!candidates || candidates.length === 0) {
    return { analyzed: 0, published: 0, skipped: 0, errors: [] };
  }

  const rules = await getClipRules();

  for (const candidate of candidates) {
    try {
      // Mark as analyzing
      await supabaseAdmin
        .from('ff_clip_candidates')
        .update({ status: 'analyzing', updated_at: new Date().toISOString() })
        .eq('id', candidate.id);

      // Fetch transcript
      const transcript = await fetchClipTranscript(candidate.source_url);

      if (!transcript || transcript.text.length < 50) {
        // No transcript available — create analysis row with needs_transcription
        await supabaseAdmin
          .from('ff_clip_analysis')
          .insert({
            candidate_id: candidate.id,
            transcript_source: 'youtube',
            transcript_text: transcript?.text || null,
            transcript_len: transcript?.text?.length || 0,
            needs_transcription: true,
            meta: { reason: 'transcript_unavailable_or_too_short' },
          });

        await supabaseAdmin
          .from('ff_clip_candidates')
          .update({ status: 'analyzed', updated_at: new Date().toISOString() })
          .eq('id', candidate.id);

        skipped++;
        continue;
      }

      // Hard reject check
      if (isHardReject(transcript.text)) {
        await supabaseAdmin
          .from('ff_clip_analysis')
          .insert({
            candidate_id: candidate.id,
            transcript_source: 'youtube',
            transcript_text: transcript.text.slice(0, 5000),
            transcript_len: transcript.text.length,
            meta: { reason: 'hard_reject' },
          });

        await supabaseAdmin
          .from('ff_clip_candidates')
          .update({ status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', candidate.id);

        analyzed++;
        continue;
      }

      // Score
      const scores = await scoreCandidate({
        transcript_text: transcript.text,
        segments: transcript.segments,
        view_count: candidate.view_count,
        channel: candidate.channel,
      });

      // Insert analysis
      const { data: analysisRow, error: analysisErr } = await supabaseAdmin
        .from('ff_clip_analysis')
        .insert({
          candidate_id: candidate.id,
          transcript_source: transcript.source,
          transcript_text: transcript.text.slice(0, 50000),
          transcript_len: transcript.text.length,
          ingredients: scores.ingredients,
          primary_ingredient: scores.primary_ingredient,
          product_types: scores.product_types,
          ingredient_density: scores.ingredient_density,
          format_score: scores.format_score,
          obscurity_boost: scores.obscurity_boost,
          confidence: scores.confidence,
          best_moments: scores.best_moments,
          risk_flags: scores.risk_flags,
          risk_level: scores.risk_level,
          needs_transcription: false,
        })
        .select('id')
        .single();

      if (analysisErr) {
        errors.push(`Analysis insert ${candidate.video_id}: ${analysisErr.message}`);
        await supabaseAdmin
          .from('ff_clip_candidates')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', candidate.id);
        continue;
      }

      analyzed++;

      // Check publish gates
      const passesGates =
        transcript.source === 'youtube' &&
        transcript.text.length >= rules.thresholds.min_transcript_len &&
        scores.ingredients.length >= rules.thresholds.min_ingredients &&
        scores.confidence >= rules.thresholds.min_confidence &&
        scores.format_score >= rules.thresholds.min_format_score;

      if (passesGates && analysisRow) {
        // Build tags array
        const tags = [
          ...scores.ingredients.map(i => i.toLowerCase()),
          ...scores.product_types,
          scores.risk_level,
        ];

        const { error: indexErr } = await supabaseAdmin
          .from('ff_clip_index')
          .insert({
            candidate_id: candidate.id,
            analysis_id: analysisRow.id,
            source_url: candidate.source_url,
            video_id: candidate.video_id,
            title: candidate.title,
            channel: candidate.channel,
            thumbnail: candidate.thumbnail,
            duration_s: candidate.duration_s,
            primary_ingredient: scores.primary_ingredient!,
            product_types: scores.product_types,
            ingredients: scores.ingredients,
            best_moments: scores.best_moments,
            risk_flags: scores.risk_flags,
            risk_level: scores.risk_level,
            confidence: scores.confidence,
            format_score: scores.format_score,
            tags,
            visibility: 'pro',
          });

        if (indexErr) {
          errors.push(`Index insert ${candidate.video_id}: ${indexErr.message}`);
          await supabaseAdmin
            .from('ff_clip_candidates')
            .update({ status: 'analyzed', updated_at: new Date().toISOString() })
            .eq('id', candidate.id);
        } else {
          await supabaseAdmin
            .from('ff_clip_candidates')
            .update({ status: 'published', updated_at: new Date().toISOString() })
            .eq('id', candidate.id);
          published++;
        }
      } else {
        // Doesn't pass gates → mark as analyzed (NOT rejected)
        await supabaseAdmin
          .from('ff_clip_candidates')
          .update({ status: 'analyzed', updated_at: new Date().toISOString() })
          .eq('id', candidate.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Candidate ${candidate.video_id}: ${msg}`);
      await supabaseAdmin
        .from('ff_clip_candidates')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', candidate.id);
    }
  }

  return { analyzed, published, skipped, errors };
}
