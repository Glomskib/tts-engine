/**
 * Ensure a Google Drive folder exists for a content item.
 *
 * Model 2: We never upload large files to FlashFlow.
 * We only store drive_folder_id + drive_folder_url as links.
 *
 * Idempotent: if drive_folder_id is already set, returns it.
 * Uses service account authentication (lib/drive/client.ts).
 *
 * Folder hierarchy:
 *   {workspace_root_folder}/
 *     {brand_name}/     (optional, if brand assigned)
 *       FF - Brand - Product - Title - FF-xxxxxx
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getDriveService, isDriveConfigured } from './client';
import { buildContentItemFolderName } from './folder-name';

const LOG = '[drive:ensure-folder]';

export type EnsureFolderErrorCode =
  | 'DRIVE_NOT_CONFIGURED'
  | 'ITEM_NOT_FOUND'
  | 'DRIVE_API_ERROR'
  | 'NO_ROOT_FOLDER';

export interface EnsureFolderResult {
  ok: true;
  drive_folder_id: string;
  drive_folder_url: string;
  created: boolean;
}

export interface EnsureFolderError {
  ok: false;
  code: EnsureFolderErrorCode;
  message: string;
}

/**
 * Get the workspace root folder ID.
 * Priority: workspace_settings.drive_root_folder_id > env DRIVE_ROOT_FOLDER_ID
 */
async function getWorkspaceRootFolderId(workspaceId: string): Promise<string | null> {
  // Try workspace_settings table
  const { data } = await supabaseAdmin
    .from('workspace_settings')
    .select('drive_root_folder_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (data?.drive_root_folder_id) return data.drive_root_folder_id;

  // Fallback to env
  return process.env.DRIVE_ROOT_FOLDER_ID || null;
}

/**
 * Find an existing folder by name within a parent folder.
 */
async function findFolderByName(parentId: string, name: string): Promise<{ id: string; url: string } | null> {
  const drive = getDriveService();
  const safeName = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${parentId}' in parents and trashed=false`,
    pageSize: 1,
    fields: 'files(id, webViewLink)',
  });

  const file = res.data.files?.[0];
  if (!file?.id) return null;

  return {
    id: file.id,
    url: file.webViewLink || `https://drive.google.com/drive/folders/${file.id}`,
  };
}

/**
 * Find or create a brand subfolder under the root.
 */
async function ensureBrandFolder(rootFolderId: string, brandName: string): Promise<string> {
  const existing = await findFolderByName(rootFolderId, brandName);
  if (existing) return existing.id;

  const drive = getDriveService();
  const res = await drive.files.create({
    requestBody: {
      name: brandName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id',
  });

  console.log(`${LOG} Created brand folder "${brandName}": ${res.data.id}`);
  return res.data.id!;
}

export async function ensureContentItemDriveFolder(opts: {
  workspaceId: string;
  contentItemId: string;
}): Promise<EnsureFolderResult | EnsureFolderError> {
  const { workspaceId, contentItemId } = opts;

  // 1. Check Drive is configured
  if (!isDriveConfigured()) {
    return { ok: false, code: 'DRIVE_NOT_CONFIGURED', message: 'Google Drive service account is not configured.' };
  }

  // 2. Fetch content item
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('content_items')
    .select('id, short_id, title, drive_folder_id, drive_folder_url, brand_id, product_id')
    .eq('id', contentItemId)
    .eq('workspace_id', workspaceId)
    .single();

  if (fetchErr || !item) {
    return { ok: false, code: 'ITEM_NOT_FOUND', message: 'Content item not found' };
  }

  // 3. Idempotent: if folder already exists, return it
  if (item.drive_folder_id && item.drive_folder_url) {
    return {
      ok: true,
      drive_folder_id: item.drive_folder_id,
      drive_folder_url: item.drive_folder_url,
      created: false,
    };
  }

  // 4. Get workspace root folder
  const rootFolderId = await getWorkspaceRootFolderId(workspaceId);
  if (!rootFolderId) {
    return {
      ok: false,
      code: 'NO_ROOT_FOLDER',
      message: 'No Drive root folder configured. Set DRIVE_ROOT_FOLDER_ID or configure in workspace settings.',
    };
  }

  // 5. Fetch brand/product names for folder name
  let brandName: string | null = null;
  let productName: string | null = null;

  if (item.brand_id) {
    const { data: b } = await supabaseAdmin.from('brands').select('name').eq('id', item.brand_id).maybeSingle();
    if (b) brandName = b.name;
  }
  if (item.product_id) {
    const { data: p } = await supabaseAdmin.from('products').select('name').eq('id', item.product_id).maybeSingle();
    if (p) productName = p.name;
  }

  // 6. Determine parent folder (brand subfolder or root)
  let parentFolderId = rootFolderId;
  try {
    if (brandName) {
      parentFolderId = await ensureBrandFolder(rootFolderId, brandName);
    }
  } catch (err) {
    console.error(`${LOG} Failed to create brand folder:`, err);
    return { ok: false, code: 'DRIVE_API_ERROR', message: 'Failed to create brand folder in Drive' };
  }

  // 7. Build folder name and create
  const folderName = buildContentItemFolderName({
    shortId: item.short_id,
    title: item.title,
    brandName,
    productName,
  });

  try {
    // Check if folder with this name already exists (re-run safety)
    const existing = await findFolderByName(parentFolderId, folderName);
    if (existing) {
      await supabaseAdmin
        .from('content_items')
        .update({ drive_folder_id: existing.id, drive_folder_url: existing.url })
        .eq('id', contentItemId);

      return { ok: true, drive_folder_id: existing.id, drive_folder_url: existing.url, created: false };
    }

    const drive = getDriveService();
    const res = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id, webViewLink',
    });

    const folderId = res.data.id!;
    const folderUrl = res.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;

    // 8. Persist on content_items row
    await supabaseAdmin
      .from('content_items')
      .update({ drive_folder_id: folderId, drive_folder_url: folderUrl })
      .eq('id', contentItemId);

    console.log(`${LOG} Created folder "${folderName}": ${folderId}`);
    return { ok: true, drive_folder_id: folderId, drive_folder_url: folderUrl, created: true };
  } catch (err) {
    console.error(`${LOG} Drive folder creation failed:`, err);
    return { ok: false, code: 'DRIVE_API_ERROR', message: 'Failed to create Google Drive folder' };
  }
}
