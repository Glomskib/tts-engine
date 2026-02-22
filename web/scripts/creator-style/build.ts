#!/usr/bin/env tsx
/**
 * Creator-style build — CLI script.
 *
 * Loads all samples for a creator, aggregates patterns locally,
 * synthesizes a fingerprint via Sonnet, runs plagiarism check,
 * stores to DB and posts to Mission Control.
 *
 * Usage:
 *   pnpm ff:build -- --creator amber
 *   pnpm ff:build -- --creator amber --min-samples 5
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { getSamplesForCreator, upsertFingerprint } from './lib/db';
import { checkPlagiarism } from '../../lib/creator-style/plagiarism-guard';
import { postMCDoc } from '../../lib/flashflow/mission-control';
import type { SampleAnalysis, CreatorFingerprint, BuildConfig, BuildResult } from './lib/types';

const TAG = '[ff:build]';

// ── Arg parsing ──

function parseArgs(): BuildConfig {
  const args = process.argv.slice(2);
  let creatorKey = '';
  let minSamples = 3;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--creator':
        creatorKey = args[++i] || '';
        break;
      case '--min-samples':
        minSamples = parseInt(args[++i] || '3', 10);
        break;
    }
  }

  if (!creatorKey) {
    console.error(`${TAG} --creator is required`);
    process.exit(1);
  }

  return { creatorKey, minSamples };
}

// ── Aggregation helpers (same pattern as style-pack.ts) ──

function topItems(items: string[], limit: number = 3): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const normalized = item.toLowerCase().trim();
    if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

function mostCommon(items: string[]): string {
  const top = topItems(items, 1);
  return top[0] || 'unknown';
}

// ── Sonnet synthesis ──

async function synthesizeFingerprint(
  creatorKey: string,
  analyses: SampleAnalysis[],
  localAgg: {
    hookTypes: string[];
    hookTemplates: string[];
    formats: string[];
    flows: string[];
    tones: string[];
    transitions: string[];
    nicheSignals: string[];
    emotionalRange: string[];
    avgWordCount: number;
    avgDuration: number;
  },
): Promise<{
  summary: string;
  hook_patterns: string[];
  structure_rules: string[];
  do_list: string[];
  dont_list: string[];
  banned_phrases: string[];
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const systemPrompt = `You are a content strategy expert synthesizing a creator's style fingerprint from multiple video analyses.

CRITICAL RULES:
- Never include verbatim quotes from source content
- Use [bracket] notation for templates and patterns
- Focus on abstract formulas and structural patterns
- The fingerprint will be used to generate new content in this creator's style`;

  const prompt = `Synthesize a comprehensive style fingerprint for creator "${creatorKey}" based on ${analyses.length} video analyses.

LOCAL AGGREGATION DATA:
- Top hook types: ${localAgg.hookTypes.join(', ')}
- Hook templates: ${localAgg.hookTemplates.join(' | ')}
- Content formats: ${localAgg.formats.join(', ')}
- Typical flows: ${localAgg.flows.join(' | ')}
- Tones: ${localAgg.tones.join(', ')}
- Common transitions: ${localAgg.transitions.join(', ')}
- Niche signals: ${localAgg.nicheSignals.join(', ')}
- Emotional range: ${localAgg.emotionalRange.join(', ')}
- Avg hook word count: ${localAgg.avgWordCount}
- Avg video duration: ${localAgg.avgDuration}s

INDIVIDUAL ANALYSES (JSON):
${JSON.stringify(analyses.slice(0, 10), null, 2).slice(0, 6000)}

Return ONLY valid JSON:
{
  "summary": "2-3 sentence overview of this creator's distinctive style and approach",
  "hook_patterns": ["pattern 1", "pattern 2", "..."],
  "structure_rules": ["rule 1", "rule 2", "..."],
  "do_list": ["do this", "do that", "..."],
  "dont_list": ["don't do this", "don't do that", "..."],
  "banned_phrases": ["phrases to never use verbatim from this creator's content"]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.4,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Sonnet API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text || '';

  // Parse JSON
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) jsonStr = objectMatch[0];
  }

  return JSON.parse(jsonStr);
}

// ── Main ──

async function main() {
  const cfg = parseArgs();

  console.log(`${TAG} Building fingerprint for creator="${cfg.creatorKey}"`);

  // 1. Load all samples
  const samples = await getSamplesForCreator(cfg.creatorKey);
  const withAnalysis = samples.filter(s => s.analysis);

  console.log(`${TAG} Found ${samples.length} samples, ${withAnalysis.length} with analysis`);

  if (withAnalysis.length < cfg.minSamples) {
    console.error(
      `${TAG} Need at least ${cfg.minSamples} analyzed samples, got ${withAnalysis.length}. ` +
      `Run ff:ingest first to collect more.`
    );
    process.exit(1);
  }

  // 2. Local aggregation
  const analyses = withAnalysis.map(s => s.analysis as SampleAnalysis);

  const allHookTypes = analyses.map(a => a.hook_pattern?.type).filter(Boolean) as string[];
  const allHookTemplates = analyses.map(a => a.hook_pattern?.template).filter(Boolean) as string[];
  const allHookWordCounts = analyses.map(a => a.hook_pattern?.avg_word_count).filter(Boolean) as number[];
  const allFormats = analyses.map(a => a.structure_pattern?.format).filter(Boolean) as string[];
  const allFlows = analyses.map(a => a.structure_pattern?.flow).filter(Boolean) as string[];
  const allDurations = withAnalysis.map(s => s.duration_seconds).filter(Boolean) as number[];
  const allTones = analyses.map(a => a.voice_patterns?.tone).filter(Boolean) as string[];
  const allTransitions = analyses.flatMap(a => a.voice_patterns?.transition_phrases || []);
  const allNiche = analyses.flatMap(a => a.content_dna?.niche_signals || []);
  const allEmotional = analyses.flatMap(a => a.content_dna?.emotional_range || []);

  const avgWordCount = allHookWordCounts.length > 0
    ? Math.round(allHookWordCounts.reduce((a, b) => a + b, 0) / allHookWordCounts.length)
    : 0;
  const avgDuration = allDurations.length > 0
    ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
    : 0;

  const localAgg = {
    hookTypes: topItems(allHookTypes),
    hookTemplates: [...new Set(allHookTemplates)].slice(0, 5),
    formats: topItems(allFormats),
    flows: [...new Set(allFlows)].slice(0, 3),
    tones: topItems(allTones),
    transitions: topItems(allTransitions, 5),
    nicheSignals: topItems(allNiche),
    emotionalRange: topItems(allEmotional, 4),
    avgWordCount,
    avgDuration,
  };

  console.log(`${TAG} Local aggregation complete`);

  // 3. Sonnet synthesis
  console.log(`${TAG} Synthesizing fingerprint via Sonnet...`);
  const synthesis = await synthesizeFingerprint(cfg.creatorKey, analyses, localAgg);

  // 4. Plagiarism check on outputs
  const sourceTranscripts = withAnalysis
    .map(s => s.transcript)
    .filter(Boolean) as string[];

  const textsToCheck = [
    synthesis.summary,
    ...synthesis.hook_patterns,
    ...synthesis.structure_rules,
    ...synthesis.do_list,
    ...synthesis.dont_list,
  ].join(' ');

  const plagiarismResult = checkPlagiarism(textsToCheck, sourceTranscripts);

  if (!plagiarismResult.passed) {
    console.warn(
      `${TAG} Plagiarism check found ${plagiarismResult.violations.length} violation(s) ` +
      `(similarity: ${(plagiarismResult.similarity_score * 100).toFixed(1)}%). ` +
      `Violations stored but fingerprint still saved.`,
    );
  } else {
    console.log(`${TAG} Plagiarism check passed (similarity: ${(plagiarismResult.similarity_score * 100).toFixed(1)}%)`);
  }

  // 5. Build fingerprint
  const fingerprint: CreatorFingerprint = {
    creator_key: cfg.creatorKey,
    summary: synthesis.summary,
    hook_patterns: synthesis.hook_patterns,
    structure_rules: synthesis.structure_rules,
    banned_phrases: synthesis.banned_phrases,
    do_list: synthesis.do_list,
    dont_list: synthesis.dont_list,
    samples_count: withAnalysis.length,
    version: 1, // Will increment via DB
  };

  // Check if existing version
  const { getFingerprint } = await import('./lib/db');
  const existing = await getFingerprint(cfg.creatorKey);
  if (existing) {
    fingerprint.version = (existing.version || 0) + 1;
  }

  // 6. Save to DB
  await upsertFingerprint(fingerprint);

  // 7. Post to Mission Control
  const mcContent = [
    `## Creator Fingerprint: ${cfg.creatorKey} (v${fingerprint.version})`,
    `**Samples analyzed:** ${fingerprint.samples_count}`,
    `**Built:** ${new Date().toISOString()}`,
    '',
    `### Summary`,
    fingerprint.summary,
    '',
    `### Hook Patterns`,
    ...fingerprint.hook_patterns.map(p => `- ${p}`),
    '',
    `### Structure Rules`,
    ...fingerprint.structure_rules.map(r => `- ${r}`),
    '',
    `### Do`,
    ...fingerprint.do_list.map(d => `- ${d}`),
    '',
    `### Don't`,
    ...fingerprint.dont_list.map(d => `- ${d}`),
    '',
    `### Banned Phrases`,
    ...fingerprint.banned_phrases.map(b => `- "${b}"`),
    '',
    plagiarismResult.passed
      ? `*Plagiarism check: PASSED*`
      : `*Plagiarism check: ${plagiarismResult.violations.length} violation(s), similarity ${(plagiarismResult.similarity_score * 100).toFixed(1)}%*`,
  ].join('\n');

  postMCDoc({
    title: `Creator Fingerprint — ${cfg.creatorKey} v${fingerprint.version}`,
    category: 'reports',
    lane: 'FlashFlow',
    tags: ['creator-style', cfg.creatorKey],
    content: mcContent,
  }).catch(err => {
    console.warn(`${TAG} MC doc post failed:`, err);
  });

  // 8. Print to console
  console.log(`\n${TAG} === Fingerprint: ${cfg.creatorKey} (v${fingerprint.version}) ===\n`);
  console.log(`Summary: ${fingerprint.summary}\n`);
  console.log(`Hook Patterns:`);
  fingerprint.hook_patterns.forEach(p => console.log(`  - ${p}`));
  console.log(`\nStructure Rules:`);
  fingerprint.structure_rules.forEach(r => console.log(`  - ${r}`));
  console.log(`\nDo:`);
  fingerprint.do_list.forEach(d => console.log(`  - ${d}`));
  console.log(`\nDon't:`);
  fingerprint.dont_list.forEach(d => console.log(`  - ${d}`));
  console.log(`\nBanned Phrases:`);
  fingerprint.banned_phrases.forEach(b => console.log(`  - "${b}"`));
  console.log(`\nSamples: ${fingerprint.samples_count}`);
  console.log(`Plagiarism: ${plagiarismResult.passed ? 'PASSED' : `${plagiarismResult.violations.length} violations`}`);

  const result: BuildResult = {
    creator_key: cfg.creatorKey,
    samples_used: withAnalysis.length,
    fingerprint,
  };

  return result;
}

main().catch(err => {
  console.error(`${TAG} Fatal error:`, err);
  process.exit(1);
});
