/**
 * Google Drive client via Service Account.
 *
 * Uses GOOGLE_SERVICE_ACCOUNT_JSON env var (stringified JSON).
 * Exports a singleton authenticated Drive v3 client.
 *
 * Why service account instead of OAuth:
 *   - No per-user token management
 *   - Works in cron/worker contexts without user session
 *   - Folders are created in a shared Drive or shared with users
 */

import { google, type drive_v3 } from 'googleapis';

const LOG = '[drive:client]';

let _driveClient: drive_v3.Drive | null = null;

/**
 * Parse the service account JSON from env.
 * Supports both stringified JSON and base64-encoded JSON.
 */
function getServiceAccountCredentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON env var is not set. ' +
      'Set it to the stringified JSON of your Google Cloud service account key.',
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    // Try base64 decoding
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON or base64-encoded JSON.');
    }
  }
}

/**
 * Returns an authenticated Google Drive v3 client (singleton).
 *
 * Scopes:
 *   - drive (full access for folder/file management)
 */
export function getDriveService(): drive_v3.Drive {
  if (_driveClient) return _driveClient;

  const credentials = getServiceAccountCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  _driveClient = google.drive({ version: 'v3', auth });
  console.log(`${LOG} Service account Drive client initialized`);
  return _driveClient;
}

/**
 * Check if service account credentials are configured.
 * Use this for graceful degradation when Drive is optional.
 */
export function isDriveConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

/**
 * Reset the singleton (for testing).
 */
export function _resetDriveClient(): void {
  _driveClient = null;
}
