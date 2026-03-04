/**
 * Ensure a Content Item has a Google Drive upload folder.
 *
 * Idempotent: returns existing folder if already created,
 * otherwise creates one using the SKU-slug naming convention.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getDriveClient } from './google-drive';
import { createOrGetWorkspaceRootFolder, createOrGetBrandFolder } from './drive-content-items';
import { buildSkuSlug } from '@/lib/content-items/skuSlug';

const LOG = '[ensure-drive-folder]';

export type EnsureFolderErrorCode = 'DRIVE_NOT_CONNECTED' | 'ITEM_NOT_FOUND' | 'DRIVE_API_ERROR';

export interface EnsureFolderResult {
  ok: true;
  drive_folder_id: string;
  drive_folder_url: string;
}

export interface EnsureFolderError {
  ok: false;
  code: EnsureFolderErrorCode;
  message: string;
}

export async function ensureContentItemDriveFolder(opts: {
  workspaceId: string;
  contentItemId: string;
}): Promise<EnsureFolderResult | EnsureFolderError> {
  const { workspaceId, contentItemId } = opts;

  // 1. Fetch content item with brand/product context
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('content_items')
    .select('id, short_id, title, due_at, created_at, drive_folder_id, drive_folder_url, brand_id, product_id')
    .eq('id', contentItemId)
    .eq('workspace_id', workspaceId)
    .single();

  if (fetchErr || !item) {
    return { ok: false, code: 'ITEM_NOT_FOUND', message: 'Content item not found' };
  }

  // 2. If folder already exists, return it
  if (item.drive_folder_id && item.drive_folder_url) {
    return { ok: true, drive_folder_id: item.drive_folder_id, drive_folder_url: item.drive_folder_url };
  }

  // 3. Check Drive connection
  let drive;
  try {
    drive = await getDriveClient(workspaceId);
  } catch (err) {
    console.warn(`${LOG} Drive not connected for user ${workspaceId}:`, err instanceof Error ? err.message : err);
    return { ok: false, code: 'DRIVE_NOT_CONNECTED', message: 'Google Drive is not connected. Connect it in Settings > Integrations.' };
  }

  // 4. Fetch brand/product names for SKU slug
  let brand: { name: string } | null = null;
  let product: { name: string } | null = null;

  if (item.brand_id) {
    const { data: b } = await supabaseAdmin.from('brands').select('name').eq('id', item.brand_id).maybeSingle();
    if (b) brand = { name: b.name };
  }
  if (item.product_id) {
    const { data: p } = await supabaseAdmin.from('products').select('name').eq('id', item.product_id).maybeSingle();
    if (p) product = { name: p.name };
  }

  // 5. Determine parent folder
  let parentFolder;
  try {
    parentFolder = brand
      ? await createOrGetBrandFolder(workspaceId, brand.name)
      : await createOrGetWorkspaceRootFolder(workspaceId);
  } catch (err) {
    console.error(`${LOG} Failed to get parent folder:`, err);
    return { ok: false, code: 'DRIVE_API_ERROR', message: 'Failed to access Google Drive folders' };
  }

  // 6. Build slug & create folder
  const { folderName } = buildSkuSlug(item, brand, product);

  try {
    const res = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolder.id],
      },
      fields: 'id, webViewLink',
    });

    const folderId = res.data.id!;
    const folderUrl = res.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;

    // 7. Persist on content_items row
    await supabaseAdmin
      .from('content_items')
      .update({ drive_folder_id: folderId, drive_folder_url: folderUrl })
      .eq('id', contentItemId);

    console.log(`${LOG} Created folder "${folderName}": ${folderId}`);
    return { ok: true, drive_folder_id: folderId, drive_folder_url: folderUrl };
  } catch (err) {
    console.error(`${LOG} Drive folder creation failed:`, err);
    return { ok: false, code: 'DRIVE_API_ERROR', message: 'Failed to create Google Drive folder' };
  }
}
