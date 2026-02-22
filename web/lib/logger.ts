/**
 * Structured JSON-lines logger for CLI scripts and workers.
 *
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const log = createLogger('nightly-selector');
 *   log.info('queue_checked', { count: 3 });
 *   log.error('api_failed', { status: 500 });
 *   log.metric('queue_deficit', 2);
 */

import * as crypto from 'crypto';
import * as os from 'os';

export type LogLevel = 'info' | 'warn' | 'error' | 'metric';

interface LogEntry {
  ts: string;
  level: LogLevel;
  worker: string;
  runId: string;
  hostname: string;
  event: string;
  data?: Record<string, unknown>;
}

interface MetricEntry {
  ts: string;
  level: 'metric';
  worker: string;
  runId: string;
  hostname: string;
  metric: string;
  value: number;
  data?: Record<string, unknown>;
}

export interface Logger {
  /** Log an informational event */
  info(event: string, data?: Record<string, unknown>): void;
  /** Log a warning event */
  warn(event: string, data?: Record<string, unknown>): void;
  /** Log an error event */
  error(event: string, data?: Record<string, unknown>): void;
  /** Log a numeric metric */
  metric(name: string, value: number, data?: Record<string, unknown>): void;
  /** The run ID for this logger instance */
  runId: string;
  /** The worker/script name */
  worker: string;
}

/**
 * Create a structured logger that emits JSON lines to stdout/stderr.
 *
 * @param worker - Script/worker name (e.g. 'nightly-selector', 'nightly-draft')
 * @param runId  - Optional run ID; auto-generated if omitted
 */
export function createLogger(worker: string, runId?: string): Logger {
  const id = runId || `${worker.slice(0, 3)}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const host = os.hostname();

  function emit(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      worker,
      runId: id,
      hostname: host,
      event,
    };
    if (data && Object.keys(data).length > 0) {
      entry.data = data;
    }

    const line = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  function emitMetric(name: string, value: number, data?: Record<string, unknown>): void {
    const entry: MetricEntry = {
      ts: new Date().toISOString(),
      level: 'metric',
      worker,
      runId: id,
      hostname: host,
      metric: name,
      value,
    };
    if (data && Object.keys(data).length > 0) {
      entry.data = data;
    }
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  return {
    info: (event, data) => emit('info', event, data),
    warn: (event, data) => emit('warn', event, data),
    error: (event, data) => emit('error', event, data),
    metric: (name, value, data) => emitMetric(name, value, data),
    runId: id,
    worker,
  };
}
