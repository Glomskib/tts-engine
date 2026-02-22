import type { PostgrestError } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupabaseResult<T> = { data: T | null; error: PostgrestError | null };

export type SafeInsertOk<T> = { ok: true; data: T };
export type SafeInsertErr = {
  ok: false;
  error: PostgrestError | Error;
  attempts: number;
};
export type SafeInsertResult<T> = SafeInsertOk<T> | SafeInsertErr;

interface SafeInsertOpts {
  tag?: string;
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

const NETWORK_PATTERNS = [
  "fetch failed",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "socket hang up",
  "network request failed",
  "ERR_NETWORK",
  "UND_ERR_CONNECT_TIMEOUT",
];

export function isRetryableError(
  error: PostgrestError | Error | null,
): boolean {
  if (!error) return false;

  // Supabase PostgREST 5xx — code is the HTTP status as a string
  if ("code" in error && typeof error.code === "string") {
    if (error.code === "500" || error.code === "503") return true;
  }

  const msg = error.message?.toLowerCase() ?? "";
  return NETWORK_PATTERNS.some((p) => msg.includes(p.toLowerCase()));
}

// ---------------------------------------------------------------------------
// safeInsert
// ---------------------------------------------------------------------------

export async function safeInsert<T>(
  fn: () => PromiseLike<SupabaseResult<T>>,
  opts?: SafeInsertOpts,
): Promise<SafeInsertResult<T>> {
  const tag = opts?.tag ?? "unknown";
  const maxRetries = opts?.maxRetries ?? 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await fn();

      if (!error) {
        return { ok: true, data: data as T };
      }

      // Permanent error — don't retry
      if (!isRetryableError(error)) {
        return { ok: false, error, attempts: attempt };
      }

      // Retryable Supabase error
      console.warn(
        `[safeInsert:${tag}] attempt ${attempt}/${maxRetries}: ${error.message}`,
      );

      if (attempt === maxRetries) {
        return { ok: false, error, attempts: attempt };
      }

      await jitterDelay(attempt);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));

      if (!isRetryableError(wrapped)) {
        return { ok: false, error: wrapped, attempts: attempt };
      }

      console.warn(
        `[safeInsert:${tag}] attempt ${attempt}/${maxRetries}: ${wrapped.message}`,
      );

      if (attempt === maxRetries) {
        return { ok: false, error: wrapped, attempts: attempt };
      }

      await jitterDelay(attempt);
    }
  }

  // Unreachable, but satisfies TypeScript
  return {
    ok: false,
    error: new Error("safeInsert: max retries exceeded"),
    attempts: maxRetries,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jitterDelay(attempt: number): Promise<void> {
  const base = 500 * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return new Promise((r) => setTimeout(r, base + jitter));
}
