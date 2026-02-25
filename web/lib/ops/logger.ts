/**
 * Structured Ops Logger
 *
 * Crash-safe, JSON-structured logging for ops systems.
 * Writes structured records to stderr (captured by Vercel / Docker).
 * No console spam — all output is machine-parseable JSON.
 */

// ── Types ──────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  module: string;
  msg: string;
  [key: string]: unknown;
}

// ── Core ───────────────────────────────────────────────────

function emit(entry: LogEntry): void {
  // Write to stderr so structured logs don't pollute stdout / API responses.
  // JSON.stringify is wrapped in try/catch so a serialisation bug
  // never takes down the caller.
  try {
    const line = JSON.stringify(entry);
    process.stderr.write(line + "\n");
  } catch {
    // Last-resort fallback — should never fire, but keeps the process alive.
    process.stderr.write(
      `{"ts":"${new Date().toISOString()}","level":"error","module":"logger","msg":"Failed to serialise log entry"}\n`,
    );
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Create a scoped logger for a given module.
 *
 * Usage:
 *   const log = opsLog("jobHealth");
 *   log.info("Sweep complete", { stalled: 3 });
 *   log.error("DB query failed", { err: error.message });
 */
export function opsLog(module: string) {
  function log(level: LogLevel, msg: string, extra?: Record<string, unknown>) {
    emit({
      ts: new Date().toISOString(),
      level,
      module,
      msg,
      ...extra,
    });
  }

  return {
    info: (msg: string, extra?: Record<string, unknown>) =>
      log("info", msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) =>
      log("warn", msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) =>
      log("error", msg, extra),
  };
}
