import { describe, it, expect } from 'vitest';
import { formatReplyHeader } from './tok-comment';

describe('formatReplyHeader', () => {
  it('formats a normal username', () => {
    expect(formatReplyHeader('testuser')).toBe("Reply to @testuser's comment");
  });

  it('trims whitespace', () => {
    expect(formatReplyHeader('  spacey  ')).toBe("Reply to @spacey's comment");
  });

  it('falls back to "someone" for empty string', () => {
    expect(formatReplyHeader('')).toBe("Reply to @someone's comment");
  });

  it('falls back to "someone" for whitespace-only', () => {
    expect(formatReplyHeader('   ')).toBe("Reply to @someone's comment");
  });

  it('handles username ending in s (possessive still uses \'s)', () => {
    expect(formatReplyHeader('james')).toBe("Reply to @james's comment");
  });

  it('does not include replier username in output', () => {
    const header = formatReplyHeader('commenter');
    // Should only mention the commenter, not any replier
    expect(header).not.toContain('myusername');
    expect(header).toContain('@commenter');
  });

  it('preserves dots and underscores in username', () => {
    expect(formatReplyHeader('Health.Kate')).toBe("Reply to @Health.Kate's comment");
  });
});
