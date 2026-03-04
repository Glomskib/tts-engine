/**
 * Creator Brief Export — Markdown, plain text, and HTML formats.
 */

import type { CreatorBriefData, BriefScene, PurpleCowTier } from './creator-brief-types';
import type { CowTier } from '@/lib/content-items/types';

// ── Helpers ──────────────────────────────────────────────────────

function tierLabel(tier: CowTier): string {
  return tier === 'safe' ? 'Safe' : tier === 'edgy' ? 'Edgy' : 'Unhinged';
}

function formatCowTier(tier: PurpleCowTier, name: string): string {
  const lines: string[] = [`### ${name}`];
  if (tier.visual_interrupts?.length) {
    lines.push(`**Visual Interrupts:** ${tier.visual_interrupts.join(', ')}`);
  }
  if (tier.audio_interrupts?.length) {
    lines.push(`**Audio Interrupts:** ${tier.audio_interrupts.join(', ')}`);
  }
  if (tier.behavioral_interrupts?.length) {
    lines.push(`**Behavioral Interrupts:** ${tier.behavioral_interrupts.join(', ')}`);
  }
  if (tier.comment_bait?.length) {
    lines.push(`**Comment Bait:** ${tier.comment_bait.join(' | ')}`);
  }
  return lines.join('\n');
}

function formatScene(s: BriefScene): string {
  const lines = [
    `**Scene ${s.scene_number}**`,
    `- Framing: ${s.framing}`,
    `- Action: ${s.action}`,
    `- Lines: "${s.spoken_lines}"`,
  ];
  if (s.on_screen_text) lines.push(`- On-Screen Text: ${s.on_screen_text}`);
  if (s.broll_suggestions?.length) lines.push(`- B-Roll: ${s.broll_suggestions.join(', ')}`);
  if (s.sfx_music_note) lines.push(`- SFX/Music: ${s.sfx_music_note}`);
  return lines.join('\n');
}

// ── Markdown Export ──────────────────────────────────────────────

export function exportBriefMarkdown(brief: CreatorBriefData, selectedTier?: CowTier): string {
  const sections: string[] = [];

  sections.push(`# Creator Brief\n`);
  sections.push(`> ${brief.one_liner}\n`);

  sections.push(`## Overview`);
  sections.push(`**Goal:** ${brief.goal}`);
  sections.push(`**Audience:** ${brief.audience_persona}`);
  sections.push(`**Success Metric:** ${brief.success_metric}\n`);

  if (brief.beforehand_checklist?.length) {
    sections.push(`## Beforehand Checklist`);
    brief.beforehand_checklist.forEach(item => sections.push(`- [ ] ${item}`));
    sections.push('');
  }

  sections.push(`## Scene Direction`);
  sections.push(`**Setting:** ${brief.setting}`);
  sections.push(`**Plot:** ${brief.plot}`);
  sections.push(`**Emotional Arc:** ${brief.emotional_arc}`);
  sections.push(`**Performance Tone:** ${brief.performance_tone}\n`);

  sections.push(`## Script`);
  sections.push(`\`\`\`\n${brief.script_text}\n\`\`\`\n`);

  if (brief.scenes?.length) {
    sections.push(`## Scenes`);
    brief.scenes.forEach(s => sections.push(formatScene(s)));
    sections.push('');
  }

  if (brief.recording_notes?.length) {
    sections.push(`## Recording Notes`);
    brief.recording_notes.forEach(note => sections.push(`- ${note}`));
    sections.push('');
  }

  // Purple Cow — selected tier first, then all
  sections.push(`## Purple Cow`);
  if (selectedTier && brief.purple_cow?.tiers?.[selectedTier]) {
    sections.push(`### Selected Tier: ${tierLabel(selectedTier)}`);
    sections.push(formatCowTier(brief.purple_cow.tiers[selectedTier], tierLabel(selectedTier)));
    sections.push('');
  }
  sections.push(`### All Tiers`);
  for (const t of ['safe', 'edgy', 'unhinged'] as const) {
    if (brief.purple_cow?.tiers?.[t]) {
      sections.push(formatCowTier(brief.purple_cow.tiers[t], tierLabel(t)));
    }
  }
  if (brief.purple_cow?.notes_for_creator?.length) {
    sections.push(`\n**Notes for Creator:**`);
    brief.purple_cow.notes_for_creator.forEach(n => sections.push(`- ${n}`));
  }
  sections.push('');

  sections.push(`## Captions Pack`);
  if (brief.captions_pack?.captions?.length) {
    sections.push(`**Captions:**`);
    brief.captions_pack.captions.forEach((c, i) => sections.push(`${i + 1}. ${c}`));
  }
  if (brief.captions_pack?.hashtags?.length) {
    sections.push(`**Hashtags:** ${brief.captions_pack.hashtags.join(' ')}`);
  }
  if (brief.captions_pack?.ctas?.length) {
    sections.push(`**CTAs:** ${brief.captions_pack.ctas.join(' | ')}`);
  }
  if (brief.captions_pack?.comment_prompts?.length) {
    sections.push(`**Comment Prompts:** ${brief.captions_pack.comment_prompts.join(' | ')}`);
  }

  return sections.join('\n');
}

// ── Plain Text Export ────────────────────────────────────────────

export function exportBriefPlainText(brief: CreatorBriefData, selectedTier?: CowTier): string {
  // Strip markdown formatting for clipboard
  return exportBriefMarkdown(brief, selectedTier)
    .replace(/#{1,3}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/```\n?/g, '')
    .replace(/> /g, '')
    .replace(/- \[ \] /g, '- ');
}

// ── HTML Export ──────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cowTierHtml(tier: PurpleCowTier, name: string): string {
  const parts: string[] = [`<h3>${escHtml(name)}</h3>`];
  if (tier.visual_interrupts?.length) {
    parts.push(`<p><strong>Visual Interrupts:</strong> ${escHtml(tier.visual_interrupts.join(', '))}</p>`);
  }
  if (tier.audio_interrupts?.length) {
    parts.push(`<p><strong>Audio Interrupts:</strong> ${escHtml(tier.audio_interrupts.join(', '))}</p>`);
  }
  if (tier.behavioral_interrupts?.length) {
    parts.push(`<p><strong>Behavioral Interrupts:</strong> ${escHtml(tier.behavioral_interrupts.join(', '))}</p>`);
  }
  if (tier.comment_bait?.length) {
    parts.push(`<p><strong>Comment Bait:</strong> ${escHtml(tier.comment_bait.join(' | '))}</p>`);
  }
  return parts.join('\n');
}

export function exportBriefHTML(brief: CreatorBriefData, selectedTier?: CowTier): string {
  const h: string[] = [];

  h.push(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Creator Brief</title>`);
  h.push(`<style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}h1{color:#1a1a2e}h2{color:#16213e;border-bottom:2px solid #e2e8f0;padding-bottom:4px}h3{color:#0f3460}blockquote{border-left:4px solid #6c63ff;margin:12px 0;padding:8px 16px;background:#f8f9fa;font-style:italic}pre{background:#f1f5f9;padding:16px;border-radius:8px;overflow-x:auto;white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}th{background:#f8fafc}ul{margin:8px 0}li{margin:4px 0}</style>`);
  h.push(`</head><body>`);

  h.push(`<h1>Creator Brief</h1>`);
  h.push(`<blockquote>${escHtml(brief.one_liner)}</blockquote>`);

  h.push(`<h2>Overview</h2>`);
  h.push(`<p><strong>Goal:</strong> ${escHtml(brief.goal)}</p>`);
  h.push(`<p><strong>Audience:</strong> ${escHtml(brief.audience_persona)}</p>`);
  h.push(`<p><strong>Success Metric:</strong> ${escHtml(brief.success_metric)}</p>`);

  if (brief.beforehand_checklist?.length) {
    h.push(`<h2>Beforehand Checklist</h2><ul>`);
    brief.beforehand_checklist.forEach(item => h.push(`<li>${escHtml(item)}</li>`));
    h.push(`</ul>`);
  }

  h.push(`<h2>Scene Direction</h2>`);
  h.push(`<p><strong>Setting:</strong> ${escHtml(brief.setting)}</p>`);
  h.push(`<p><strong>Plot:</strong> ${escHtml(brief.plot)}</p>`);
  h.push(`<p><strong>Emotional Arc:</strong> ${escHtml(brief.emotional_arc)}</p>`);
  h.push(`<p><strong>Performance Tone:</strong> ${escHtml(brief.performance_tone)}</p>`);

  h.push(`<h2>Script</h2>`);
  h.push(`<pre>${escHtml(brief.script_text)}</pre>`);

  if (brief.scenes?.length) {
    h.push(`<h2>Scenes</h2>`);
    h.push(`<table><tr><th>#</th><th>Framing</th><th>Action</th><th>Lines</th><th>On-Screen</th><th>B-Roll</th></tr>`);
    brief.scenes.forEach(s => {
      h.push(`<tr><td>${s.scene_number}</td><td>${escHtml(s.framing)}</td><td>${escHtml(s.action)}</td><td>${escHtml(s.spoken_lines)}</td><td>${escHtml(s.on_screen_text || '')}</td><td>${escHtml((s.broll_suggestions || []).join(', '))}</td></tr>`);
    });
    h.push(`</table>`);
  }

  if (brief.recording_notes?.length) {
    h.push(`<h2>Recording Notes</h2><ul>`);
    brief.recording_notes.forEach(n => h.push(`<li>${escHtml(n)}</li>`));
    h.push(`</ul>`);
  }

  h.push(`<h2>Purple Cow</h2>`);
  if (selectedTier && brief.purple_cow?.tiers?.[selectedTier]) {
    h.push(`<h3>Selected Tier: ${tierLabel(selectedTier)}</h3>`);
    h.push(cowTierHtml(brief.purple_cow.tiers[selectedTier], tierLabel(selectedTier)));
  }
  for (const t of ['safe', 'edgy', 'unhinged'] as const) {
    if (brief.purple_cow?.tiers?.[t]) {
      h.push(cowTierHtml(brief.purple_cow.tiers[t], tierLabel(t)));
    }
  }
  if (brief.purple_cow?.notes_for_creator?.length) {
    h.push(`<p><strong>Notes for Creator:</strong></p><ul>`);
    brief.purple_cow.notes_for_creator.forEach(n => h.push(`<li>${escHtml(n)}</li>`));
    h.push(`</ul>`);
  }

  h.push(`<h2>Captions Pack</h2>`);
  if (brief.captions_pack?.captions?.length) {
    h.push(`<p><strong>Captions:</strong></p><ol>`);
    brief.captions_pack.captions.forEach(c => h.push(`<li>${escHtml(c)}</li>`));
    h.push(`</ol>`);
  }
  if (brief.captions_pack?.hashtags?.length) {
    h.push(`<p><strong>Hashtags:</strong> ${escHtml(brief.captions_pack.hashtags.join(' '))}</p>`);
  }
  if (brief.captions_pack?.ctas?.length) {
    h.push(`<p><strong>CTAs:</strong> ${escHtml(brief.captions_pack.ctas.join(' | '))}</p>`);
  }
  if (brief.captions_pack?.comment_prompts?.length) {
    h.push(`<p><strong>Comment Prompts:</strong> ${escHtml(brief.captions_pack.comment_prompts.join(' | '))}</p>`);
  }

  h.push(`</body></html>`);
  return h.join('\n');
}
