/**
 * Standardized stub response helper.
 *
 * Use this for API routes and functions that are planned but not yet implemented.
 * Returns a consistent shape so the frontend can detect stubs and show "Coming soon" badges.
 */

export interface StubResponseOptions {
  /** Feature name, e.g. "AI Draft Reply" */
  feature: string;
  /** Why it's stubbed, e.g. "Awaiting Runway API integration" */
  reason: string;
  /** Optional next steps / what will change */
  nextSteps?: string;
  /** Optional ETA string, e.g. "Q3 2026" */
  eta?: string;
}

export interface StubResponseBody {
  ok: true;
  stub: true;
  feature: string;
  reason: string;
  nextSteps: string | null;
  eta: string | null;
}

/**
 * Build a standardized stub JSON response body.
 * All stub routes should return `NextResponse.json(stubResponse({...}))`.
 */
export function stubResponse(opts: StubResponseOptions): StubResponseBody {
  return {
    ok: true,
    stub: true,
    feature: opts.feature,
    reason: opts.reason,
    nextSteps: opts.nextSteps ?? null,
    eta: opts.eta ?? null,
  };
}

/**
 * Check whether an API response is a stub (for client-side detection).
 */
export function isStubResponse(body: unknown): body is StubResponseBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'stub' in body &&
    (body as Record<string, unknown>).stub === true
  );
}
