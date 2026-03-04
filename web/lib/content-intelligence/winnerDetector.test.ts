import { describe, it, expect } from 'vitest';
import { evaluateWinnerCriteria } from './winnerDetector';
import type { PostmortemJSON } from '@/lib/ai/postmortem/generatePostmortem';

const BASE_POSTMORTEM: PostmortemJSON = {
  summary: 'Test postmortem',
  what_worked: ['hook'],
  what_failed: [],
  hook_analysis: {
    hook_strength: 6,
    pattern_detected: 'question opener',
    scroll_stop_rating: 7,
    improvement: 'add teaser',
  },
  engagement_analysis: {
    engagement_rate: 2.5,
    comment_sentiment: 'neutral',
    share_driver: 'relatability',
    save_driver: 'useful info',
  },
  next_ideas: ['try again'],
  winner_candidate: false,
};

describe('evaluateWinnerCriteria', () => {
  it('returns not a winner for below-threshold metrics', () => {
    const result = evaluateWinnerCriteria(
      BASE_POSTMORTEM,
      { views: 1000, shares: 10 },
      5,
    );
    expect(result.isWinner).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('detects winner by engagement rate > workspace average', () => {
    const pm = {
      ...BASE_POSTMORTEM,
      engagement_analysis: { ...BASE_POSTMORTEM.engagement_analysis, engagement_rate: 8.5 },
    };
    const result = evaluateWinnerCriteria(pm, { views: 1000, shares: 10 }, 5);
    expect(result.isWinner).toBe(true);
    expect(result.reasons.some(r => r.includes('Engagement rate'))).toBe(true);
  });

  it('detects winner by hook strength >= 8', () => {
    const pm = {
      ...BASE_POSTMORTEM,
      hook_analysis: { ...BASE_POSTMORTEM.hook_analysis, hook_strength: 9 },
    };
    const result = evaluateWinnerCriteria(pm, { views: 1000, shares: 10 });
    expect(result.isWinner).toBe(true);
    expect(result.reasons.some(r => r.includes('Hook strength'))).toBe(true);
  });

  it('detects winner by high share rate (> 10% of views)', () => {
    const result = evaluateWinnerCriteria(
      BASE_POSTMORTEM,
      { views: 1000, shares: 150 },
      10, // high threshold so engagement doesn't trigger
    );
    expect(result.isWinner).toBe(true);
    expect(result.reasons.some(r => r.includes('Share rate'))).toBe(true);
  });

  it('uses default 3% threshold when no workspace average', () => {
    const pm = {
      ...BASE_POSTMORTEM,
      engagement_analysis: { ...BASE_POSTMORTEM.engagement_analysis, engagement_rate: 4.0 },
    };
    const result = evaluateWinnerCriteria(pm, { views: 100, shares: 1 });
    expect(result.isWinner).toBe(true);
  });

  it('handles null metrics gracefully', () => {
    const result = evaluateWinnerCriteria(
      BASE_POSTMORTEM,
      { views: null, shares: null },
    );
    // Only engagement rate check can trigger with null metrics
    expect(result.isWinner).toBe(false);
  });

  it('accumulates multiple reasons', () => {
    const pm: PostmortemJSON = {
      ...BASE_POSTMORTEM,
      hook_analysis: { ...BASE_POSTMORTEM.hook_analysis, hook_strength: 9 },
      engagement_analysis: { ...BASE_POSTMORTEM.engagement_analysis, engagement_rate: 8.5 },
    };
    const result = evaluateWinnerCriteria(pm, { views: 1000, shares: 150 }, 5);
    expect(result.isWinner).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
