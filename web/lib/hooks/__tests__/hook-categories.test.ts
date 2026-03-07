import { describe, it, expect } from 'vitest';
import { HOOK_CATEGORIES, selectCategories } from '../hook-categories';

describe('HOOK_CATEGORIES', () => {
  it('has 10 categories', () => {
    expect(HOOK_CATEGORIES).toHaveLength(10);
  });

  it('each category has required fields', () => {
    for (const cat of HOOK_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(cat.visualHint).toBeTruthy();
      expect(cat.verbalHint).toBeTruthy();
    }
  });

  it('all category ids are unique', () => {
    const ids = HOOK_CATEGORIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('selectCategories', () => {
  it('returns requested count', () => {
    const result = selectCategories(5);
    expect(result).toHaveLength(5);
  });

  it('never returns more than total categories', () => {
    const result = selectCategories(20);
    expect(result).toHaveLength(10);
  });

  it('returns unique categories', () => {
    const result = selectCategories(5);
    const ids = result.map(c => c.id);
    expect(new Set(ids).size).toBe(5);
  });
});
