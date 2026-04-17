/**
 * GET /api/video-engine/modes
 *
 * Public-ish surface — returns the registered modes + the templates and CTAs
 * for each. Powers the upload screen's Mode Selector.
 */
import { NextRequest, NextResponse } from 'next/server';
import { listModes } from '@/lib/video-engine/modes';
import { listTemplates } from '@/lib/video-engine/templates';
import { listCTAs } from '@/lib/video-engine/ctas';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const modes = listModes().map((m) => ({
    key: m.key,
    label: m.label,
    description: m.description,
    defaultTemplateKeys: m.defaultTemplateKeys,
    defaultCTAKey: m.defaultCTAKey,
    templates: listTemplates(m.key).map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      pacing: t.pacing,
      captionTone: t.captionTone,
      defaultCTAKey: t.defaultCTAKey,
    })),
    ctas: listCTAs(m.key).map((c) => ({
      key: c.key,
      label: c.label,
      overlayText: c.overlayText,
      subtitle: c.subtitle,
      accentColor: c.accentColor,
    })),
  }));

  return NextResponse.json({ ok: true, data: { modes } });
}
