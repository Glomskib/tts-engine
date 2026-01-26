/**
 * ingestion-client.ts
 *
 * Client-side helpers for ingestion API calls.
 * Provides typed responses and error handling.
 */

// ============================================================================
// Types
// ============================================================================

export type IngestionSource = "tiktok_url" | "csv" | "sheets" | "monday" | "manual";
export type JobStatus = "pending" | "validated" | "committed" | "failed" | "partial";
export type RowStatus = "pending" | "validated" | "committed" | "failed" | "duplicate";

export interface ErrorSummaryEntry {
  error_type: string;
  count: number;
  examples: string[];
}

export interface IngestionJob {
  id: string;
  source: IngestionSource;
  source_ref: string;
  status: JobStatus;
  total_rows: number;
  success_count: number;
  failure_count: number;
  duplicate_count: number;
  error_summary: ErrorSummaryEntry[];
  created_by: string;
  created_at: string;
  validated_at: string | null;
  committed_at: string | null;
  completed_at: string | null;
}

export interface IngestionRow {
  id: string;
  job_id: string;
  external_id: string;
  normalized_payload: Record<string, unknown>;
  status: RowStatus;
  error: string | null;
  created_video_id: string | null;
  created_at: string;
  validated_at: string | null;
  committed_at: string | null;
}

export interface ReconciliationReport {
  job_id: string;
  source: IngestionSource;
  source_ref: string;
  status: JobStatus;
  total_rows: number;
  committed_rows: {
    external_id: string;
    video_id: string;
    caption?: string;
  }[];
  failed_rows: {
    external_id: string;
    error: string;
    normalized_payload: Record<string, unknown>;
  }[];
  duplicate_rows: {
    external_id: string;
    existing_video_id: string;
  }[];
}

export interface CsvRow {
  external_id?: string;
  caption?: string;
  hashtags?: string;
  product_sku?: string;
  product_link?: string;
  script_text?: string;
  target_account?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  correlation_id?: string;
}

interface TikTokIngestResponse {
  job_id: string;
  status: string;
  total_rows: number;
  validated_count: number;
  failed_count: number;
  duplicate_count: number;
  committed_count?: number;
  created_video_ids?: string[];
  errors?: ErrorSummaryEntry[];
  max_urls_per_chunk?: number;
}

interface CsvIngestResponse {
  job_id: string;
  status: string;
  total_rows: number;
  validated_count: number;
  failed_count: number;
  duplicate_count: number;
  committed_count?: number;
  created_video_ids?: string[];
  errors?: ErrorSummaryEntry[];
  max_rows_per_chunk?: number;
}

// Default chunk sizes (backend may return different limits)
const DEFAULT_CHUNK_SIZE = 250;

interface JobListResponse {
  jobs: IngestionJob[];
  total: number;
  limit: number;
  offset: number;
}

interface JobDetailResponse {
  job: IngestionJob;
  rows?: IngestionRow[];
  rows_total?: number;
  report?: ReconciliationReport;
}

interface JobActionResponse {
  job: IngestionJob;
  validated_count?: number;
  failed_count?: number;
  duplicate_count?: number;
  committed_count?: number;
  created_video_ids?: string[];
  errors?: ErrorSummaryEntry[];
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Ingest TikTok URLs with automatic chunking for large datasets.
 * Returns aggregated results across all chunks.
 */
export async function ingestTikTokUrls(
  urls: string[],
  validateOnly: boolean = false,
  onProgress?: (progress: { current: number; total: number; jobId: string }) => void
): Promise<ApiResponse<TikTokIngestResponse>> {
  try {
    const chunkSize = DEFAULT_CHUNK_SIZE;

    // If small enough, single request
    if (urls.length <= chunkSize) {
      const res = await fetch("/api/ingestion/tiktok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, validate_only: validateOnly }),
      });
      return await res.json();
    }

    // Chunked upload
    let jobId: string | undefined;
    let totalValidated = 0;
    let totalFailed = 0;
    let totalDuplicates = 0;
    let totalCommitted = 0;
    const allCreatedIds: string[] = [];
    const allErrors: ErrorSummaryEntry[] = [];
    let finalStatus = "pending";

    for (let i = 0; i < urls.length; i += chunkSize) {
      const chunk = urls.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= urls.length;

      const res = await fetch("/api/ingestion/tiktok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: chunk,
          job_id: jobId,
          // Only validate on intermediate chunks; final chunk does full process
          validate_only: isLastChunk ? validateOnly : true,
        }),
      });

      const result: ApiResponse<TikTokIngestResponse> = await res.json();

      if (!result.ok || !result.data) {
        return result;
      }

      // Capture job_id from first chunk
      if (!jobId) {
        jobId = result.data.job_id;
      }

      // Report progress
      if (onProgress && jobId) {
        onProgress({ current: Math.min(i + chunkSize, urls.length), total: urls.length, jobId });
      }

      // On last chunk, capture final results
      if (isLastChunk) {
        totalValidated = result.data.validated_count;
        totalFailed = result.data.failed_count;
        totalDuplicates = result.data.duplicate_count;
        totalCommitted = result.data.committed_count || 0;
        if (result.data.created_video_ids) {
          allCreatedIds.push(...result.data.created_video_ids);
        }
        if (result.data.errors) {
          allErrors.push(...result.data.errors);
        }
        finalStatus = result.data.status;
      }
    }

    return {
      ok: true,
      data: {
        job_id: jobId!,
        status: finalStatus,
        total_rows: urls.length,
        validated_count: totalValidated,
        failed_count: totalFailed,
        duplicate_count: totalDuplicates,
        committed_count: totalCommitted,
        created_video_ids: allCreatedIds,
        errors: allErrors.length > 0 ? allErrors : undefined,
        max_urls_per_chunk: chunkSize,
      },
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Ingest CSV rows with automatic chunking for large datasets.
 * Returns aggregated results across all chunks.
 */
export async function ingestCsvRows(
  sourceRef: string,
  rows: CsvRow[],
  validateOnly: boolean = false,
  onProgress?: (progress: { current: number; total: number; jobId: string }) => void
): Promise<ApiResponse<CsvIngestResponse>> {
  try {
    const chunkSize = DEFAULT_CHUNK_SIZE;

    // If small enough, single request
    if (rows.length <= chunkSize) {
      const res = await fetch("/api/ingestion/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_ref: sourceRef, rows, validate_only: validateOnly }),
      });
      return await res.json();
    }

    // Chunked upload
    let jobId: string | undefined;
    let totalValidated = 0;
    let totalFailed = 0;
    let totalDuplicates = 0;
    let totalCommitted = 0;
    const allCreatedIds: string[] = [];
    const allErrors: ErrorSummaryEntry[] = [];
    let finalStatus = "pending";

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const isLastChunk = i + chunkSize >= rows.length;

      const res = await fetch("/api/ingestion/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_ref: sourceRef,
          rows: chunk,
          job_id: jobId,
          // Only validate on intermediate chunks; final chunk does full process
          validate_only: isLastChunk ? validateOnly : true,
        }),
      });

      const result: ApiResponse<CsvIngestResponse> = await res.json();

      if (!result.ok || !result.data) {
        return result;
      }

      // Capture job_id from first chunk
      if (!jobId) {
        jobId = result.data.job_id;
      }

      // Report progress
      if (onProgress && jobId) {
        onProgress({ current: Math.min(i + chunkSize, rows.length), total: rows.length, jobId });
      }

      // On last chunk, capture final results
      if (isLastChunk) {
        totalValidated = result.data.validated_count;
        totalFailed = result.data.failed_count;
        totalDuplicates = result.data.duplicate_count;
        totalCommitted = result.data.committed_count || 0;
        if (result.data.created_video_ids) {
          allCreatedIds.push(...result.data.created_video_ids);
        }
        if (result.data.errors) {
          allErrors.push(...result.data.errors);
        }
        finalStatus = result.data.status;
      }
    }

    return {
      ok: true,
      data: {
        job_id: jobId!,
        status: finalStatus,
        total_rows: rows.length,
        validated_count: totalValidated,
        failed_count: totalFailed,
        duplicate_count: totalDuplicates,
        committed_count: totalCommitted,
        created_video_ids: allCreatedIds,
        errors: allErrors.length > 0 ? allErrors : undefined,
        max_rows_per_chunk: chunkSize,
      },
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * List ingestion jobs.
 */
export async function listIngestionJobs(params?: {
  source?: IngestionSource;
  status?: JobStatus;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<JobListResponse>> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.source) searchParams.set("source", params.source);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));

    const url = `/api/ingestion/jobs${searchParams.toString() ? `?${searchParams}` : ""}`;
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Get ingestion job detail.
 */
export async function getIngestionJob(
  jobId: string,
  includeRows: boolean = true
): Promise<ApiResponse<JobDetailResponse>> {
  try {
    const url = `/api/ingestion/jobs/${jobId}?include_rows=${includeRows}`;
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Get reconciliation report for a job.
 */
export async function getReconciliationReport(
  jobId: string
): Promise<ApiResponse<{ report: ReconciliationReport }>> {
  try {
    const res = await fetch(`/api/ingestion/jobs/${jobId}?report=true`);
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Perform action on a job.
 */
export async function performJobAction(
  jobId: string,
  action: "validate" | "commit" | "retry"
): Promise<ApiResponse<JobActionResponse>> {
  try {
    const res = await fetch(`/api/ingestion/jobs/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ============================================================================
// CSV Parsing Helper
// ============================================================================

/**
 * Parse CSV text into rows.
 * Handles quoted fields and common edge cases.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse header
  const headers = parseCsvLine(lines[0]);

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0 || values.every((v) => !v.trim())) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Generate CSV content for download.
 */
export function generateCsv(rows: Record<string, unknown>[], headers: string[]): string {
  const lines: string[] = [];

  // Header row
  lines.push(headers.map(escapeCsvField).join(","));

  // Data rows
  for (const row of rows) {
    const values = headers.map((h) => escapeCsvField(String(row[h] ?? "")));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Trigger browser download of CSV.
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
