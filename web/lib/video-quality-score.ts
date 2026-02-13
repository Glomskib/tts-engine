export interface QualityScore {
  product_visibility: number; // 1-5
  label_legibility: number; // 1-5
  prompt_accuracy: number; // 1-5
  text_overlay: number; // 1-5
  composition: number; // 1-5
  total: number; // sum, out of 25
  notes?: string;
  scored_by?: string;
  scored_at?: string;
}

export const QUALITY_DIMENSIONS = [
  { key: 'product_visibility', label: 'Product Visibility', hint: 'Is the product clearly shown?' },
  { key: 'label_legibility', label: 'Label Legibility', hint: 'Can you read the label?' },
  { key: 'prompt_accuracy', label: 'Prompt Accuracy', hint: 'Does video match what was requested?' },
  { key: 'text_overlay', label: 'Text Overlay', hint: 'Are Shotstack overlays readable?' },
  { key: 'composition', label: 'Composition', hint: 'Professional feel?' },
] as const;

const DIMENSION_KEYS = QUALITY_DIMENSIONS.map((d) => d.key);

export function calculateTotal(scores: Partial<QualityScore>): number {
  return DIMENSION_KEYS.reduce((sum, key) => sum + (Number(scores[key]) || 0), 0);
}

export function validateQualityScore(input: unknown): QualityScore | null {
  if (!input || typeof input !== 'object') return null;

  const obj = input as Record<string, unknown>;

  for (const key of DIMENSION_KEYS) {
    const val = obj[key];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 5) {
      return null;
    }
  }

  const total = calculateTotal(obj as Partial<QualityScore>);

  const score: QualityScore = {
    product_visibility: obj.product_visibility as number,
    label_legibility: obj.label_legibility as number,
    prompt_accuracy: obj.prompt_accuracy as number,
    text_overlay: obj.text_overlay as number,
    composition: obj.composition as number,
    total,
  };

  if (typeof obj.notes === 'string' && obj.notes.trim()) {
    score.notes = obj.notes.trim();
  }
  if (typeof obj.scored_by === 'string' && obj.scored_by.trim()) {
    score.scored_by = obj.scored_by.trim();
  }
  if (typeof obj.scored_at === 'string' && obj.scored_at.trim()) {
    score.scored_at = obj.scored_at.trim();
  }

  return score;
}
