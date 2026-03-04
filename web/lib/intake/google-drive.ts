/**
 * Google Drive client — centralized for Intake Connector.
 *
 * Handles:
 *   - OAuth2 client creation with auto token refresh
 *   - File listing with video-only filter
 *   - File download stream
 *   - Folder creation + listing
 *
 * All operations require a valid refresh token stored encrypted in DB.
 * Never expose tokens to browser.
 */
import { google, type drive_v3 } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { decrypt, encrypt, type EncryptedPayload } from '@/lib/security/crypto';
import { createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const LOG = '[intake:gdrive]';

// Video MIME types we accept from Drive
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',   // .mov
  'video/x-msvideo',   // .avi
  'video/webm',
  'video/x-matroska',  // .mkv
  'video/3gpp',
  'video/x-ms-wmv',
  'video/mpeg',
];

const MIN_FILE_SIZE = 500 * 1024; // 500KB — skip tiny files

// ── OAuth2 Configuration ────────────────────────────────────────

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, or GOOGLE_DRIVE_REDIRECT_URI');
  }

  return { clientId, clientSecret, redirectUri };
}

export function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file', // needed for folder creation
  'https://www.googleapis.com/auth/userinfo.email',
];

export const READONLY_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Generate OAuth consent URL for a user.
 */
export function getAuthUrl(state: string, includeWrite = true): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: includeWrite ? SCOPES : READONLY_SCOPES,
    state,
  });
}

// ── Token Management ────────────────────────────────────────────

/**
 * Exchange authorization code for tokens and store encrypted in DB.
 */
export async function exchangeCodeAndStore(
  code: string,
  userId: string,
): Promise<{ email: string | null }> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received — user must re-consent');
  }

  // Encrypt refresh token
  const refreshEnc = encrypt(tokens.refresh_token);

  // Get user email from Google
  client.setCredentials(tokens);
  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    email = userInfo.data.email || null;
  } catch {
    // Non-fatal — email is optional
  }

  // Upsert token row
  const { error } = await supabaseAdmin
    .from('drive_oauth_tokens')
    .upsert({
      user_id: userId,
      provider: 'google_drive',
      refresh_token_enc: refreshEnc.ciphertext,
      token_iv: refreshEnc.iv,
      token_tag: refreshEnc.tag,
      expiry_ts: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      scopes: tokens.scope?.split(' ') || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) throw new Error(`Failed to store token: ${error.message}`);

  return { email };
}

/**
 * Get an authenticated Drive client for a user.
 * Decrypts stored refresh token and creates OAuth2 client.
 */
export async function getDriveClient(userId: string): Promise<drive_v3.Drive> {
  const { data: tokenRow, error } = await supabaseAdmin
    .from('drive_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !tokenRow) {
    throw new Error('No Drive tokens found — user needs to connect');
  }

  const refreshToken = decrypt({
    ciphertext: tokenRow.refresh_token_enc,
    iv: tokenRow.token_iv,
    tag: tokenRow.token_tag,
  });

  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  // Auto-refresh handler: update stored expiry
  client.on('tokens', async (newTokens) => {
    if (newTokens.expiry_date) {
      await supabaseAdmin
        .from('drive_oauth_tokens')
        .update({
          expiry_ts: new Date(newTokens.expiry_date).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }
  });

  return google.drive({ version: 'v3', auth: client });
}

// ── File Operations ─────────────────────────────────────────────

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  md5Checksum: string | null;
  modifiedTime: string;
  createdTime: string;
}

/**
 * List video files in a specific folder.
 */
export async function listVideoFiles(
  userId: string,
  folderId: string,
  pageToken?: string,
): Promise<{ files: DriveFileInfo[]; nextPageToken: string | null }> {
  const drive = await getDriveClient(userId);

  // Build MIME filter
  const mimeFilter = VIDEO_MIME_TYPES.map(m => `mimeType='${m}'`).join(' or ');
  const q = `'${folderId}' in parents and (${mimeFilter}) and trashed=false`;

  const res = await drive.files.list({
    q,
    pageSize: 100,
    pageToken: pageToken || undefined,
    fields: 'nextPageToken, files(id, name, mimeType, size, md5Checksum, modifiedTime, createdTime)',
    orderBy: 'createdTime desc',
  });

  const files: DriveFileInfo[] = (res.data.files || [])
    .filter(f => f.id && f.name && parseInt(f.size || '0', 10) >= MIN_FILE_SIZE)
    .map(f => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType || 'video/mp4',
      size: parseInt(f.size || '0', 10),
      md5Checksum: f.md5Checksum || null,
      modifiedTime: f.modifiedTime || '',
      createdTime: f.createdTime || '',
    }));

  return {
    files,
    nextPageToken: res.data.nextPageToken || null,
  };
}

/**
 * Lightweight metadata fetch — no download.
 */
export interface FileMetadata {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export async function getFileMetadata(
  userId: string,
  fileId: string,
): Promise<FileMetadata> {
  const drive = await getDriveClient(userId);
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
  });
  return {
    name: meta.data.name || `intake-${fileId}.mp4`,
    mimeType: meta.data.mimeType || 'video/mp4',
    sizeBytes: parseInt(meta.data.size || '0', 10),
  };
}

/**
 * Stream a file from Drive to a local path (no full-file memory buffer).
 * Returns actual bytes written.
 */
export async function downloadFileStream(
  userId: string,
  fileId: string,
  destPath: string,
): Promise<{ bytesWritten: number }> {
  const drive = await getDriveClient(userId);

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream', timeout: 5 * 60 * 1000 },
  );

  const readable = res.data as unknown as Readable;
  const writable = createWriteStream(destPath);
  await pipeline(readable, writable);

  const stats = await stat(destPath);
  return { bytesWritten: stats.size };
}

/**
 * Download a file from Drive as a buffer (legacy convenience wrapper).
 * Prefer downloadFileStream for large files.
 */
export async function downloadFile(
  userId: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  const drive = await getDriveClient(userId);

  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
  });

  const name = meta.data.name || `intake-${fileId}.mp4`;
  const mimeType = meta.data.mimeType || 'video/mp4';

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer', timeout: 5 * 60 * 1000 },
  );

  const buffer = Buffer.from(res.data as ArrayBuffer);
  return { buffer, mimeType, name };
}

// ── Folder Operations ───────────────────────────────────────────

export interface DriveFolderInfo {
  id: string;
  name: string;
}

/**
 * List folders matching a search query.
 */
export async function listFolders(
  userId: string,
  query?: string,
): Promise<DriveFolderInfo[]> {
  const drive = await getDriveClient(userId);

  let q = "mimeType='application/vnd.google-apps.folder' and trashed=false";
  if (query) {
    q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
  }

  const res = await drive.files.list({
    q,
    pageSize: 50,
    fields: 'files(id, name)',
    orderBy: 'modifiedTime desc',
  });

  return (res.data.files || [])
    .filter(f => f.id && f.name)
    .map(f => ({ id: f.id!, name: f.name! }));
}

/**
 * Create the recommended folder structure: FlashFlow Intake / Raw Footage
 */
export async function createRecommendedFolders(
  userId: string,
): Promise<{ intakeFolder: DriveFolderInfo; rawFootageFolder: DriveFolderInfo }> {
  const drive = await getDriveClient(userId);

  // Create "FlashFlow Intake" in root
  const intakeRes = await drive.files.create({
    requestBody: {
      name: 'FlashFlow Intake',
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id, name',
  });

  const intakeFolder = { id: intakeRes.data.id!, name: intakeRes.data.name! };

  // Create "Raw Footage" inside it
  const rawRes = await drive.files.create({
    requestBody: {
      name: 'Raw Footage',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [intakeFolder.id],
    },
    fields: 'id, name',
  });

  const rawFootageFolder = { id: rawRes.data.id!, name: rawRes.data.name! };

  return { intakeFolder, rawFootageFolder };
}

/**
 * Delete stored tokens for a user (disconnect).
 */
export async function revokeAndDelete(userId: string): Promise<void> {
  // Try to revoke token with Google
  try {
    const drive = await getDriveClient(userId);
    const auth = drive.context._options.auth as unknown as { revokeCredentials?: () => Promise<void> };
    if (auth && typeof auth.revokeCredentials === 'function') {
      await auth.revokeCredentials();
    }
  } catch {
    // Non-fatal — token may already be invalid
  }

  // Delete from DB
  await supabaseAdmin
    .from('drive_oauth_tokens')
    .delete()
    .eq('user_id', userId);

  // Update connector status
  await supabaseAdmin
    .from('drive_intake_connectors')
    .update({
      status: 'DISCONNECTED',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  console.log(`${LOG} Disconnected Drive for user ${userId}`);
}
