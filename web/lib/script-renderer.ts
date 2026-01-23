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

// All allowed keys in ScriptJson (for strict validation)
const ALLOWED_SCRIPT_JSON_KEYS = new Set([
  'hook', 'body', 'cta', 'bullets',
  'on_screen_text', 'b_roll',
  'pacing', 'compliance_notes', 'uploader_instructions',
  'product_tags', 'sections'
]);

// Length caps for strict validation
const LENGTH_CAPS = {
  hook: 1000,
  body: 5000,
  cta: 500,
  pacing: 50,
  compliance_notes: 2000,
  uploader_instructions: 2000,
  bullets_max_count: 20,
  bullets_max_length: 500,
  on_screen_text_max_count: 20,
  on_screen_text_max_length: 200,
  b_roll_max_count: 20,
  b_roll_max_length: 300,
  product_tags_max_count: 20,
  product_tags_max_length: 100,
  sections_max_count: 10,
  section_name_max_length: 100,
  section_content_max_length: 3000,
};

/**
 * Validates that the provided object matches the ScriptJson schema.
 * Returns validation result with errors if invalid.
 *
 * @param json - The object to validate
 * @param options.strict - If true, rejects unknown keys (default: false for backwards compat)
 */
export function validateScriptJson(
  json: unknown,
  options: { strict?: boolean } = {}
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { strict = false } = options;

  if (typeof json !== 'object' || json === null) {
    return { valid: false, errors: ['script_json must be an object'] };
  }

  const obj = json as Record<string, unknown>;

  // Strict mode: reject unknown keys
  if (strict) {
    for (const key of Object.keys(obj)) {
      if (!ALLOWED_SCRIPT_JSON_KEYS.has(key)) {
        errors.push(`Unknown key '${key}' is not allowed`);
      }
    }
  }

  // Check optional string fields
  const stringFields = ['hook', 'body', 'cta', 'pacing', 'compliance_notes', 'uploader_instructions'] as const;
  for (const field of stringFields) {
    if (obj[field] !== undefined) {
      if (typeof obj[field] !== 'string') {
        errors.push(`${field} must be a string`);
      } else if (strict) {
        const cap = LENGTH_CAPS[field as keyof typeof LENGTH_CAPS] as number;
        if (cap && (obj[field] as string).length > cap) {
          errors.push(`${field} exceeds max length of ${cap} characters`);
        }
      }
    }
  }

  // Check string array fields
  const stringArrayFields = ['bullets', 'on_screen_text', 'b_roll', 'product_tags'] as const;
  for (const field of stringArrayFields) {
    if (obj[field] !== undefined) {
      if (!Array.isArray(obj[field])) {
        errors.push(`${field} must be an array`);
      } else {
        const arr = obj[field] as unknown[];
        // Strict mode: check array length cap
        if (strict) {
          const countCap = LENGTH_CAPS[`${field}_max_count` as keyof typeof LENGTH_CAPS] as number;
          if (countCap && arr.length > countCap) {
            errors.push(`${field} exceeds max count of ${countCap} items`);
          }
        }
        const itemLengthCap = strict
          ? (LENGTH_CAPS[`${field}_max_length` as keyof typeof LENGTH_CAPS] as number)
          : 0;
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== 'string') {
            errors.push(`${field}[${i}] must be a string`);
          } else if (strict && itemLengthCap && (arr[i] as string).length > itemLengthCap) {
            errors.push(`${field}[${i}] exceeds max length of ${itemLengthCap} characters`);
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
      // Strict mode: check sections count cap
      if (strict && obj.sections.length > LENGTH_CAPS.sections_max_count) {
        errors.push(`sections exceeds max count of ${LENGTH_CAPS.sections_max_count} items`);
      }
      for (let i = 0; i < obj.sections.length; i++) {
        const section = obj.sections[i];
        if (typeof section !== 'object' || section === null) {
          errors.push(`sections[${i}] must be an object`);
        } else {
          const sec = section as Record<string, unknown>;
          if (typeof sec.name !== 'string') {
            errors.push(`sections[${i}].name must be a string`);
          } else if (strict && (sec.name as string).length > LENGTH_CAPS.section_name_max_length) {
            errors.push(`sections[${i}].name exceeds max length of ${LENGTH_CAPS.section_name_max_length} characters`);
          }
          if (typeof sec.content !== 'string') {
            errors.push(`sections[${i}].content must be a string`);
          } else if (strict && (sec.content as string).length > LENGTH_CAPS.section_content_max_length) {
            errors.push(`sections[${i}].content exceeds max length of ${LENGTH_CAPS.section_content_max_length} characters`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes a ScriptJson object by:
 * - Trimming all string values
 * - Removing empty strings from arrays
 * - Removing undefined/empty optional fields
 * - Filtering out empty sections
 *
 * Call this BEFORE validation to ensure clean data.
 */
export function normalizeScriptJson(json: unknown): ScriptJson {
  if (typeof json !== 'object' || json === null) {
    return {};
  }

  const obj = json as Record<string, unknown>;
  const result: ScriptJson = {};

  // Normalize string fields
  const stringFields = ['hook', 'body', 'cta', 'pacing', 'compliance_notes', 'uploader_instructions'] as const;
  for (const field of stringFields) {
    if (typeof obj[field] === 'string') {
      const trimmed = (obj[field] as string).trim();
      if (trimmed) {
        (result as Record<string, string>)[field] = trimmed;
      }
    }
  }

  // Normalize string array fields
  const arrayFields = ['bullets', 'on_screen_text', 'b_roll', 'product_tags'] as const;
  for (const field of arrayFields) {
    if (Array.isArray(obj[field])) {
      const filtered = (obj[field] as unknown[])
        .filter((item): item is string => typeof item === 'string')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      if (filtered.length > 0) {
        (result as Record<string, string[]>)[field] = filtered;
      }
    }
  }

  // Normalize sections
  if (Array.isArray(obj.sections)) {
    const normalizedSections = (obj.sections as unknown[])
      .filter((sec): sec is { name: unknown; content: unknown } =>
        typeof sec === 'object' && sec !== null
      )
      .map(sec => ({
        name: typeof sec.name === 'string' ? sec.name.trim() : '',
        content: typeof sec.content === 'string' ? sec.content.trim() : '',
      }))
      .filter(sec => sec.name && sec.content);
    if (normalizedSections.length > 0) {
      result.sections = normalizedSections;
    }
  }

  return result;
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
