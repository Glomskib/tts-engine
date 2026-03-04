import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Sentry before any imports
vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn((cb) => cb({ setTags: vi.fn(), setLevel: vi.fn(), setFingerprint: vi.fn(), setExtra: vi.fn() })),
  captureException: vi.fn(),
}));

import { withErrorCapture, markCaptured, isCaptured } from './withErrorCapture';

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(),
    }),
  },
}));

describe('withErrorCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through successful responses unchanged', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const wrapped = withErrorCapture(handler, { routeName: '/test' });

    const result = await wrapped(new Request('http://localhost/test'));
    expect(result).toEqual({ ok: true, status: 200 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('catches thrown errors and returns 500 JSON', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapped = withErrorCapture(handler, { routeName: '/test', feature: 'test-feature' });

    const result = await wrapped(new Request('http://localhost/test'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (result as any).body;
    expect(body.ok).toBe(false);
    expect(body.error_code).toBe('INTERNAL');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).status).toBe(500);
  });

  it('does not double-capture already-marked errors', async () => {
    const error = new Error('already captured');
    markCaptured(error);
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = withErrorCapture(handler, { routeName: '/test' });

    const { captureRouteError } = await import('@/lib/errorTracking');
    const spy = vi.spyOn(await import('@/lib/errorTracking'), 'captureRouteError');

    await wrapped(new Request('http://localhost/test'));

    // captureRouteError should NOT be called since the error was pre-marked
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('converts string throws to Error objects', async () => {
    const handler = vi.fn().mockRejectedValue('string error');
    const wrapped = withErrorCapture(handler, { routeName: '/test' });

    const result = await wrapped(new Request('http://localhost/test'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (result as any).body;
    expect(body.ok).toBe(false);
    expect(body.error_code).toBe('INTERNAL');
  });
});

describe('markCaptured / isCaptured', () => {
  it('marks and detects captured errors', () => {
    const error = new Error('test');
    expect(isCaptured(error)).toBe(false);
    markCaptured(error);
    expect(isCaptured(error)).toBe(true);
  });

  it('returns false for non-errors', () => {
    expect(isCaptured(null)).toBe(false);
    expect(isCaptured('string')).toBe(false);
    expect(isCaptured(42)).toBe(false);
  });
});
