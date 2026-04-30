/**
 * File-backed meeting notes loader.
 *
 * Notes live as markdown in `web/content/meetings/<group>/<YYYY-MM-DD>-<slug>.md`.
 * Each file may include a tiny YAML-ish front matter block (-- delimited):
 *
 *   ---
 *   title: FFF Debrief
 *   attendees: Brandon, Tim, Josh, Miles (agent)
 *   decisions:
 *     - Capture warm rider list into HHH funnel
 *   actions:
 *     - Brandon: post FFF thank-you
 *   ---
 *
 *   <markdown body>
 *
 * No DB table required for now. When we want richer queries (search, threads,
 * comments) we can promote this to a `meeting_notes` table without changing
 * the consumer interface.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import type { MmmMeetingNote } from './types';
import { MMM_GROUP_SLUG } from './registry';

const NOTES_DIR = path.join(process.cwd(), 'content', 'meetings', 'mmm');

interface ParsedFrontMatter {
  title?: string;
  attendees?: string[];
  decisions?: string[];
  actions?: string[];
}

function parseListField(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

function parseFrontMatter(text: string): { meta: ParsedFrontMatter; body: string } {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { meta: {}, body: text };

  const block = match[1];
  const body = text.slice(match[0].length).trim();
  const meta: ParsedFrontMatter = {};

  // Inline scalars
  const titleMatch = block.match(/^title:\s*(.+)$/m);
  if (titleMatch) meta.title = titleMatch[1].trim();

  const attendeesMatch = block.match(/^attendees:\s*(.+)$/m);
  if (attendeesMatch) {
    meta.attendees = attendeesMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
  }

  // List fields: "decisions:" followed by "- item" lines
  const sectionMatch = (key: string) => {
    const re = new RegExp(`^${key}:\\s*\\n([\\s\\S]*?)(?=\\n[a-z_]+:|$)`, 'm');
    const m = block.match(re);
    return m ? parseListField(m[1]) : undefined;
  };

  meta.decisions = sectionMatch('decisions');
  meta.actions = sectionMatch('actions');

  return { meta, body };
}

function deriveSlug(filename: string): { slug: string; date_iso: string } {
  // Expect: YYYY-MM-DD-some-slug.md
  const base = filename.replace(/\.md$/, '');
  const dateMatch = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (dateMatch) {
    return { slug: dateMatch[2], date_iso: dateMatch[1] };
  }
  return { slug: base, date_iso: new Date().toISOString().slice(0, 10) };
}

export function listMmmMeetingNotes(): MmmMeetingNote[] {
  if (!existsSync(NOTES_DIR)) return [];

  const files = readdirSync(NOTES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();

  return files.map((file) => {
    const fullPath = path.join(NOTES_DIR, file);
    const raw = readFileSync(fullPath, 'utf8');
    const { meta, body } = parseFrontMatter(raw);
    const { slug, date_iso } = deriveSlug(file);

    return {
      slug,
      group_slug: MMM_GROUP_SLUG,
      title: meta.title || slug.replace(/-/g, ' '),
      date_iso,
      attendees: meta.attendees || [],
      decisions: meta.decisions || [],
      action_items: meta.actions || [],
      body_md: body,
      source_path: path.relative(process.cwd(), fullPath),
    };
  });
}
