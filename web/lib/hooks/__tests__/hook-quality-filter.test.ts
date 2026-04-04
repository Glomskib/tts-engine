import { describe, it, expect } from 'vitest';
import { checkHookQuality, checkBatchDiversity, filterHookBatch } from '../hook-quality-filter';
import type { HookData } from '../hook-quality-filter';

function makeHook(overrides: Partial<HookData> = {}): HookData {
  return {
    visual_hook: 'Close-up of hand slamming laptop shut in frustration before pulling out the product',
    text_on_screen: 'I was mass producing 3,000 of these until...',
    verbal_hook: 'My roommate caught me doing this at 3am and honestly I have no regrets',
    strategy_note: 'Creates curiosity gap with relatable late-night behavior',
    category: 'curiosity_gap',
    why_this_works: 'Creates curiosity gap with relatable late-night behavior',
    ...overrides,
  };
}

describe('checkHookQuality', () => {
  it('passes a good hook', () => {
    const result = checkHookQuality(makeHook());
    expect(result.pass).toBe(true);
  });

  it('rejects hooks with banned phrases', () => {
    const result = checkHookQuality(makeHook({ verbal_hook: 'This changed everything about my morning routine honestly' }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('banned phrase');
  });

  it('rejects hooks with banned phrases in text_on_screen', () => {
    const result = checkHookQuality(makeHook({ text_on_screen: 'This game changer product is incredible' }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('banned phrase');
  });

  it('rejects hooks with banned openers', () => {
    const result = checkHookQuality(makeHook({ verbal_hook: 'So I just found this thing at the store and it blew my mind' }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('generic opener');
  });

  it('rejects hooks with "hey guys" opener', () => {
    const result = checkHookQuality(makeHook({ verbal_hook: 'Hey guys check out what I found at the dollar store today' }));
    expect(result.pass).toBe(false);
  });

  it('rejects too-vague visual hooks (under 5 words)', () => {
    const result = checkHookQuality(makeHook({ visual_hook: 'Person holding product' }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('vague');
  });

  it('rejects too-vague verbal hooks (under 4 words)', () => {
    const result = checkHookQuality(makeHook({ verbal_hook: 'Check this out' }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('vague');
  });

  it('rejects too-long verbal hooks (over 25 words)', () => {
    const longVerbal = Array(26).fill('word').join(' ');
    const result = checkHookQuality(makeHook({ verbal_hook: longVerbal }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('long');
  });

  it('rejects too-long text on screen (over 15 words)', () => {
    const longText = Array(16).fill('word').join(' ');
    const result = checkHookQuality(makeHook({ text_on_screen: longText }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('long');
  });
});

describe('checkBatchDiversity', () => {
  it('returns no issues for diverse hooks', () => {
    const hooks = [
      makeHook({ verbal_hook: 'My roommate caught me at 3am doing this', text_on_screen: 'I was mass producing 3,000 of these until...', category: 'curiosity_gap' }),
      makeHook({ verbal_hook: 'The real reason nobody gets results from this ingredient', text_on_screen: 'Your dermatologist won\'t tell you this part', category: 'contrarian' }),
      makeHook({ verbal_hook: 'I threw mine in the trash yesterday morning', text_on_screen: '47 days later and my skin cleared up completely', category: 'pattern_interrupt' }),
    ];
    const issues = checkBatchDiversity(hooks);
    expect(issues.size).toBe(0);
  });

  it('flags hooks with same first 3 words', () => {
    const hooks = [
      makeHook({ verbal_hook: 'My roommate caught me doing this thing', category: 'curiosity_gap' }),
      makeHook({ verbal_hook: 'My roommate caught something interesting here', category: 'contrarian' }),
    ];
    const issues = checkBatchDiversity(hooks);
    expect(issues.size).toBe(1);
    expect(issues.get(1)).toContain('Same opening');
  });

  it('flags hooks with duplicate categories', () => {
    const hooks = [
      makeHook({ verbal_hook: 'First hook opener here is what happened', category: 'curiosity_gap' }),
      makeHook({ verbal_hook: 'Second hook opener here is the deal', category: 'curiosity_gap' }),
    ];
    const issues = checkBatchDiversity(hooks);
    expect(issues.has(1)).toBe(true);
    expect(issues.get(1)).toContain('Duplicate category');
  });
});

describe('filterHookBatch', () => {
  it('passes good hooks and rejects bad ones', () => {
    const hooks = [
      makeHook({ category: 'curiosity_gap' }),
      makeHook({ verbal_hook: 'This changed everything about my skin', category: 'pattern_interrupt' }),
      makeHook({
        verbal_hook: 'The ingredient your dermatologist keeps dodging questions about',
        text_on_screen: '3 weeks. That\'s all it took.',
        category: 'contrarian',
      }),
    ];
    const { passed, rejected } = filterHookBatch(hooks);
    expect(passed.length).toBe(2);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toContain('banned phrase');
  });

  it('rejects diversity violations after quality pass', () => {
    const hooks = [
      makeHook({ verbal_hook: 'My roommate caught me doing this at 3am honestly', category: 'curiosity_gap' }),
      makeHook({ verbal_hook: 'My roommate caught something wild in the bathroom', category: 'contrarian' }),
    ];
    const { passed, rejected } = filterHookBatch(hooks);
    expect(passed.length).toBe(1);
    expect(rejected.length).toBe(1);
  });
});
