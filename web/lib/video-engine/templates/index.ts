/**
 * Template registry. Mode-scoped lookups.
 */

import type { Mode, RenderTemplate } from '../types';
import { AFFILIATE_TEMPLATES } from './affiliate';
import { NONPROFIT_TEMPLATES } from './nonprofit';

const ALL: RenderTemplate[] = [...AFFILIATE_TEMPLATES, ...NONPROFIT_TEMPLATES];

export function listTemplates(mode: Mode): RenderTemplate[] {
  return ALL.filter((t) => t.mode === mode);
}

export function getTemplate(key: string): RenderTemplate | undefined {
  return ALL.find((t) => t.key === key);
}

export function getTemplateOrDefault(key: string, mode: Mode): RenderTemplate {
  const found = getTemplate(key);
  if (found && found.mode === mode) return found;
  const fallback = ALL.find((t) => t.mode === mode);
  if (!fallback) throw new Error(`No templates registered for mode ${mode}`);
  return fallback;
}

/**
 * Resolve which template keys to render for a given run. If the run pinned
 * specific preset_keys, use those (filtered to mode). Otherwise use the mode's
 * default template list, capped to targetClipCount.
 */
export function resolveRenderTemplateKeys(
  mode: Mode,
  presetKeys: string[] | null | undefined,
  targetClipCount: number,
  defaultKeys: string[],
): string[] {
  if (presetKeys && presetKeys.length > 0) {
    const valid = presetKeys.filter((k) => {
      const t = getTemplate(k);
      return t && t.mode === mode;
    });
    if (valid.length > 0) return valid;
  }
  return defaultKeys.slice(0, Math.max(1, targetClipCount));
}
