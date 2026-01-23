// script-renderer.ts - Deterministic rendering of script_json to script_text

export interface ScriptJson {
  // Core script content
  hook?: string;
  body?: string;
  cta?: string;
  bullets?: string[];

  // Visual/production fields
  on_screen_text?: string[];
  b_roll?: string[];

  // Production guidance
  pacing?: 'slow' | 'medium' | 'fast' | string;
  compliance_notes?: string;
  uploader_instructions?: string;

  // Product tagging suggestions (optional)
  product_tags?: string[];

  // Extensible sections
  sections?: {
    name: string;
    content: string;
  }[];
}

/**
 * Validates that the provided object matches the ScriptJson schema.
 * Returns validation result with errors if invalid.
 */
export function validateScriptJson(json: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof json !== 'object' || json === null) {
    return { valid: false, errors: ['script_json must be an object'] };
  }

  const obj = json as Record<string, unknown>;

  // Check optional string fields
  const stringFields = ['hook', 'body', 'cta', 'pacing', 'compliance_notes', 'uploader_instructions'];
  for (const field of stringFields) {
    if (obj[field] !== undefined && typeof obj[field] !== 'string') {
      errors.push(`${field} must be a string`);
    }
  }

  // Check string array fields
  const stringArrayFields = ['bullets', 'on_screen_text', 'b_roll', 'product_tags'];
  for (const field of stringArrayFields) {
    if (obj[field] !== undefined) {
      if (!Array.isArray(obj[field])) {
        errors.push(`${field} must be an array`);
      } else {
        const arr = obj[field] as unknown[];
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== 'string') {
            errors.push(`${field}[${i}] must be a string`);
          }
        }
      }
    }
  }

  // Check sections array
  if (obj.sections !== undefined) {
    if (!Array.isArray(obj.sections)) {
      errors.push('sections must be an array');
    } else {
      for (let i = 0; i < obj.sections.length; i++) {
        const section = obj.sections[i];
        if (typeof section !== 'object' || section === null) {
          errors.push(`sections[${i}] must be an object`);
        } else {
          const sec = section as Record<string, unknown>;
          if (typeof sec.name !== 'string') {
            errors.push(`sections[${i}].name must be a string`);
          }
          if (typeof sec.content !== 'string') {
            errors.push(`sections[${i}].content must be a string`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Renders a ScriptJson object into plain text.
 * This is deterministic - same input always produces same output.
 *
 * Format:
 * [HOOK]
 * {hook text}
 *
 * [BODY]
 * {body text}
 *
 * • bullet 1
 * • bullet 2
 *
 * [CTA]
 * {cta text}
 *
 * [ON_SCREEN_TEXT]
 * 1. text overlay 1
 * 2. text overlay 2
 *
 * [B_ROLL]
 * - b-roll suggestion 1
 * - b-roll suggestion 2
 *
 * [PACING]
 * fast
 *
 * [COMPLIANCE_NOTES]
 * compliance notes here
 *
 * [UPLOADER_INSTRUCTIONS]
 * instructions here
 *
 * Additional sections are rendered with [SECTION_NAME] headers.
 */
export function renderScriptText(json: ScriptJson): string {
  const parts: string[] = [];

  // Hook section
  if (json.hook && json.hook.trim()) {
    parts.push('[HOOK]');
    parts.push(json.hook.trim());
    parts.push('');
  }

  // Body section
  if (json.body && json.body.trim()) {
    parts.push('[BODY]');
    parts.push(json.body.trim());
    parts.push('');
  }

  // Bullets
  if (json.bullets && json.bullets.length > 0) {
    const validBullets = json.bullets.filter(b => b && b.trim());
    if (validBullets.length > 0) {
      parts.push('[BULLETS]');
      for (const bullet of validBullets) {
        parts.push(`• ${bullet.trim()}`);
      }
      parts.push('');
    }
  }

  // CTA section
  if (json.cta && json.cta.trim()) {
    parts.push('[CTA]');
    parts.push(json.cta.trim());
    parts.push('');
  }

  // On-screen text
  if (json.on_screen_text && json.on_screen_text.length > 0) {
    const validTexts = json.on_screen_text.filter(t => t && t.trim());
    if (validTexts.length > 0) {
      parts.push('[ON_SCREEN_TEXT]');
      validTexts.forEach((text, i) => {
        parts.push(`${i + 1}. ${text.trim()}`);
      });
      parts.push('');
    }
  }

  // B-roll suggestions
  if (json.b_roll && json.b_roll.length > 0) {
    const validBRoll = json.b_roll.filter(b => b && b.trim());
    if (validBRoll.length > 0) {
      parts.push('[B_ROLL]');
      for (const item of validBRoll) {
        parts.push(`- ${item.trim()}`);
      }
      parts.push('');
    }
  }

  // Pacing
  if (json.pacing && json.pacing.trim()) {
    parts.push('[PACING]');
    parts.push(json.pacing.trim());
    parts.push('');
  }

  // Compliance notes
  if (json.compliance_notes && json.compliance_notes.trim()) {
    parts.push('[COMPLIANCE_NOTES]');
    parts.push(json.compliance_notes.trim());
    parts.push('');
  }

  // Uploader instructions
  if (json.uploader_instructions && json.uploader_instructions.trim()) {
    parts.push('[UPLOADER_INSTRUCTIONS]');
    parts.push(json.uploader_instructions.trim());
    parts.push('');
  }

  // Product tags
  if (json.product_tags && json.product_tags.length > 0) {
    const validTags = json.product_tags.filter(t => t && t.trim());
    if (validTags.length > 0) {
      parts.push('[PRODUCT_TAGS]');
      parts.push(validTags.map(t => t.trim()).join(', '));
      parts.push('');
    }
  }

  // Additional custom sections
  if (json.sections && json.sections.length > 0) {
    for (const section of json.sections) {
      if (section.name && section.content && section.content.trim()) {
        parts.push(`[${section.name.toUpperCase()}]`);
        parts.push(section.content.trim());
        parts.push('');
      }
    }
  }

  // Join and trim trailing whitespace
  return parts.join('\n').trim();
}

/**
 * Parses script_text back into ScriptJson (best effort).
 * Useful for importing legacy scripts or manual edits.
 */
export function parseScriptText(text: string): ScriptJson {
  const result: ScriptJson = {};
  const lines = text.split('\n');

  let currentSection: string | null = null;
  let currentContent: string[] = [];
  const bullets: string[] = [];
  const onScreenText: string[] = [];
  const bRoll: string[] = [];
  const productTags: string[] = [];

  const flushSection = () => {
    if (currentSection && currentContent.length > 0) {
      const content = currentContent.join('\n').trim();
      switch (currentSection.toUpperCase()) {
        case 'HOOK':
          result.hook = content;
          break;
        case 'BODY':
          result.body = content;
          break;
        case 'CTA':
          result.cta = content;
          break;
        case 'PACING':
          result.pacing = content;
          break;
        case 'COMPLIANCE_NOTES':
          result.compliance_notes = content;
          break;
        case 'UPLOADER_INSTRUCTIONS':
          result.uploader_instructions = content;
          break;
        case 'ON_SCREEN_TEXT':
          // Parse numbered items
          for (const line of currentContent) {
            const match = line.trim().match(/^\d+\.\s*(.+)$/);
            if (match) {
              onScreenText.push(match[1].trim());
            }
          }
          break;
        case 'B_ROLL':
          // Parse dash items
          for (const line of currentContent) {
            const trimmed = line.trim();
            if (trimmed.startsWith('-')) {
              bRoll.push(trimmed.slice(1).trim());
            }
          }
          break;
        case 'PRODUCT_TAGS':
          // Parse comma-separated
          const tags = content.split(',').map(t => t.trim()).filter(Boolean);
          productTags.push(...tags);
          break;
        case 'BULLETS':
          // Parse bullet items from content
          for (const line of currentContent) {
            const trimmed = line.trim();
            if (trimmed.startsWith('•')) {
              bullets.push(trimmed.slice(1).trim());
            }
          }
          break;
        default:
          // Custom section
          if (!result.sections) result.sections = [];
          result.sections.push({ name: currentSection, content });
      }
    }
    currentContent = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for section header [SECTION]
    const sectionMatch = trimmed.match(/^\[([A-Z_]+)\]$/);
    if (sectionMatch) {
      flushSection();
      currentSection = sectionMatch[1];
      continue;
    }

    // Check for bullet point (only outside specific sections, but allow in BULLETS section)
    if (currentSection !== 'ON_SCREEN_TEXT' && currentSection !== 'B_ROLL' && currentSection !== 'BULLETS') {
      if (trimmed.startsWith('•')) {
        const bulletText = trimmed.slice(1).trim();
        if (bulletText) {
          bullets.push(bulletText);
        }
        continue;
      }
    }

    // Regular content line
    if (currentSection) {
      currentContent.push(line);
    }
  }

  // Flush final section
  flushSection();

  // Add collected arrays
  if (bullets.length > 0) result.bullets = bullets;
  if (onScreenText.length > 0) result.on_screen_text = onScreenText;
  if (bRoll.length > 0) result.b_roll = bRoll;
  if (productTags.length > 0) result.product_tags = productTags;

  return result;
}
