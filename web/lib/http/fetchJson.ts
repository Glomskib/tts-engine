/**
 * Unified client-side API fetch helper with standardized error handling.
 * Normalizes all API errors to a consistent shape with correlation_id.
 */

import type { ApiErrorCode } from '@/lib/api-errors';

/**
 * Normalized API error structure for client-side handling
 */
export interface ApiClientError {
  ok: false;
  error_code: ApiErrorCode;
  message: string;
  correlation_id: string;
  details?: Record<string, unknown>;
  httpStatus: number;
}

/**
 * Success response structure
 */
export interface ApiClientSuccess<T> {
  ok: true;
  data: T;
  correlation_id?: string;
}

export type ApiClientResponse<T> = ApiClientSuccess<T> | ApiClientError;

/**
 * Type guard to check if response is an error
 */
export function isApiError<T>(response: ApiClientResponse<T>): response is ApiClientError {
  return response.ok === false;
}

/**
 * Generate a client-side correlation ID fallback
 */
function generateClientCorrelationId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `client_${Date.now()}_${random}`;
}

/**
 * Extract correlation ID from response (header first, then body)
 */
function extractCorrelationId(
  response: Response,
  body: Record<string, unknown> | null
): string {
  // Prefer header
  const headerCorrelationId = response.headers.get('x-correlation-id');
  if (headerCorrelationId) {
    return headerCorrelationId;
  }

  // Fall back to body
  if (body && typeof body.correlation_id === 'string') {
    return body.correlation_id;
  }

  // Generate client-side fallback
  return generateClientCorrelationId();
}

/**
 * Map HTTP status to default error code if not provided
 */
function getDefaultErrorCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL';
  }
}

/**
 * Normalize error response body to consistent shape
 */
function normalizeErrorBody(
  body: Record<string, unknown> | null,
  status: number,
  correlationId: string
): ApiClientError {
  // Handle standardized error shape
  if (body && body.ok === false && typeof body.error_code === 'string') {
    return {
      ok: false,
      error_code: body.error_code as ApiErrorCode,
      message: typeof body.message === 'string' ? body.message : 'An error occurred',
      correlation_id: correlationId,
      details: body.details as Record<string, unknown> | undefined,
      httpStatus: status,
    };
  }

  // Handle legacy error shape { error: "message" }
  if (body && typeof body.error === 'string') {
    return {
      ok: false,
      error_code: (body.code as ApiErrorCode) || getDefaultErrorCode(status),
      message: body.error,
      correlation_id: correlationId,
      details: body.details as Record<string, unknown> | undefined,
      httpStatus: status,
    };
  }

  // Handle unexpected error body
  return {
    ok: false,
    error_code: getDefaultErrorCode(status),
    message: body?.message as string || `Request failed with status ${status}`,
    correlation_id: correlationId,
    httpStatus: status,
  };
}

export interface FetchJsonOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown> | unknown[];
}

/**
 * Fetch JSON with standardized error handling.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (body will be JSON-stringified)
 * @returns Normalized API response with correlation_id
 *
 * @example
 * const result = await fetchJson<{ data: Video }>('/api/videos', {
 *   method: 'POST',
 *   body: { name: 'Test' }
 * });
 *
 * if (isApiError(result)) {
 *   console.error(result.message, result.correlation_id);
 * } else {
 *   console.log(result.data);
 * }
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<ApiClientResponse<T>> {
  const { body, headers, ...restOptions } = options;

  const fetchOptions: RequestInit = {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (networkError) {
    // Network error (no response)
    return {
      ok: false,
      error_code: 'INTERNAL',
      message: 'Network error: Unable to reach server',
      correlation_id: generateClientCorrelationId(),
      httpStatus: 0,
    };
  }

  // Try to parse JSON
  let jsonBody: Record<string, unknown> | null = null;
  try {
    const text = await response.text();
    if (text) {
      jsonBody = JSON.parse(text);
    }
  } catch {
    // Invalid JSON - will handle below
  }

  const correlationId = extractCorrelationId(response, jsonBody);

  // Handle non-2xx responses
  if (!response.ok) {
    return normalizeErrorBody(jsonBody, response.status, correlationId);
  }

  // Handle success responses
  if (jsonBody === null) {
    // Empty successful response
    return {
      ok: true,
      data: {} as T,
      correlation_id: correlationId,
    };
  }

  // Check for ok:false in body (some endpoints return 200 with error)
  if (jsonBody.ok === false) {
    return normalizeErrorBody(jsonBody, response.status, correlationId);
  }

  // Return success response
  // If body has data field, return that, otherwise return whole body
  if ('data' in jsonBody) {
    return {
      ok: true,
      data: jsonBody.data as T,
      correlation_id: correlationId,
    };
  }

  return {
    ok: true,
    data: jsonBody as T,
    correlation_id: correlationId,
  };
}

/**
 * POST helper
 */
export function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  options: Omit<FetchJsonOptions, 'method' | 'body'> = {}
): Promise<ApiClientResponse<T>> {
  return fetchJson<T>(url, { ...options, method: 'POST', body });
}

/**
 * GET helper
 */
export function getJson<T>(
  url: string,
  options: Omit<FetchJsonOptions, 'method' | 'body'> = {}
): Promise<ApiClientResponse<T>> {
  return fetchJson<T>(url, { ...options, method: 'GET' });
}

/**
 * PATCH helper
 */
export function patchJson<T>(
  url: string,
  body: Record<string, unknown>,
  options: Omit<FetchJsonOptions, 'method' | 'body'> = {}
): Promise<ApiClientResponse<T>> {
  return fetchJson<T>(url, { ...options, method: 'PATCH', body });
}
