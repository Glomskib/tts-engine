/**
 * Google Drive integration for Content Items.
 *
 * Creates workspace folder hierarchy and exports briefs as Google Docs/HTML.
 * Uses existing getDriveClient() for authenticated access.
 */

import { google } from 'googleapis';
import { getDriveClient, type DriveFolderInfo } from './google-drive';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildSkuSlug } from '@/lib/content-items/skuSlug';
import type { ContentItem } from '@/lib/content-items/types';
import { Readable } from 'stream';

const LOG = '[intake:drive-ci]';

// ── Workspace Root Folder ────────────────────────────────────────

/**
 * Find or create the "FlashFlow Intake" root folder for a user.
 */
export async function createOrGetWorkspaceRootFolder(
  userId: string,
): Promise<DriveFolderInfo> {
  const drive = await getDriveClient(userId);

  // Check if folder already exists
  const existing = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name='FlashFlow Intake' and 'root' in parents and trashed=false",
    pageSize: 1,
    fields: 'files(id, name)',
  });

  if (existing.data.files?.length && existing.data.files[0].id) {
    return { id: existing.data.files[0].id, name: existing.data.files[0].name! };
  }

  // Create it
  const res = await drive.files.create({
    requestBody: {
      name: 'FlashFlow Intake',
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id, name',
  });

  console.log(`${LOG} Created root folder: ${res.data.id}`);
  return { id: res.data.id!, name: res.data.name! };
}

// ── Brand Folder ─────────────────────────────────────────────────

/**
 * Find or create a brand subfolder under the workspace root.
 */
export async function createOrGetBrandFolder(
  userId: string,
  brandName: string,
): Promise<DriveFolderInfo> {
  const root = await createOrGetWorkspaceRootFolder(userId);
  const drive = await getDriveClient(userId);

  const safeName = brandName.replace(/'/g, "\\'");
  const existing = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${root.id}' in parents and trashed=false`,
    pageSize: 1,
    fields: 'files(id, name)',
  });

  if (existing.data.files?.length && existing.data.files[0].id) {
    return { id: existing.data.files[0].id, name: existing.data.files[0].name! };
  }

  const res = await drive.files.create({
    requestBody: {
      name: brandName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [root.id],
    },
    fields: 'id, name',
  });

  console.log(`${LOG} Created brand folder "${brandName}": ${res.data.id}`);
  return { id: res.data.id!, name: res.data.name! };
}

// ── Content Item Folder ──────────────────────────────────────────

/**
 * Create a SKU-slug-named folder for a content item.
 * Updates content_items.drive_folder_id + drive_folder_url.
 */
export async function createContentItemFolder(
  userId: string,
  item: ContentItem,
  brand?: { name: string } | null,
  product?: { name: string } | null,
): Promise<{ folderId: string; folderUrl: string }> {
  // Get parent folder (brand folder or root)
  const parentFolder = brand
    ? await createOrGetBrandFolder(userId, brand.name)
    : await createOrGetWorkspaceRootFolder(userId);

  const drive = await getDriveClient(userId);
  const { folderName } = buildSkuSlug(item, brand, product);

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolder.id],
    },
    fields: 'id, name, webViewLink',
  });

  const folderId = res.data.id!;
  const folderUrl = res.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;

  // Update content_items row
  await supabaseAdmin
    .from('content_items')
    .update({ drive_folder_id: folderId, drive_folder_url: folderUrl })
    .eq('id', item.id);

  console.log(`${LOG} Created content item folder "${folderName}": ${folderId}`);
  return { folderId, folderUrl };
}

// ── Brief Document ───────────────────────────────────────────────

/**
 * Create or update a "Creator Brief" Google Doc (or HTML file fallback)
 * inside the content item's Drive folder.
 * Updates content_items.brief_doc_id + brief_doc_url.
 */
export async function createOrUpdateBriefDoc(
  userId: string,
  folderId: string,
  html: string,
  title: string,
  contentItemId: string,
): Promise<{ docId: string; docUrl: string }> {
  const drive = await getDriveClient(userId);
  const docTitle = `${title} — Creator Brief`;

  // Check for existing brief doc in folder
  const existing = await drive.files.list({
    q: `name contains 'Creator Brief' and '${folderId}' in parents and trashed=false`,
    pageSize: 1,
    fields: 'files(id, name)',
  });

  let docId: string;
  let docUrl: string;

  if (existing.data.files?.length && existing.data.files[0].id) {
    // Update existing file
    docId = existing.data.files[0].id;
    await drive.files.update({
      fileId: docId,
      media: {
        mimeType: 'text/html',
        body: Readable.from(html),
      },
    });
    const fileInfo = await drive.files.get({ fileId: docId, fields: 'webViewLink' });
    docUrl = fileInfo.data.webViewLink || `https://drive.google.com/file/d/${docId}/view`;
  } else {
    // Try creating as Google Doc (HTML import)
    try {
      const res = await drive.files.create({
        requestBody: {
          name: docTitle,
          mimeType: 'application/vnd.google-apps.document',
          parents: [folderId],
        },
        media: {
          mimeType: 'text/html',
          body: Readable.from(html),
        },
        fields: 'id, webViewLink',
      });
      docId = res.data.id!;
      docUrl = res.data.webViewLink || `https://docs.google.com/document/d/${docId}/edit`;
    } catch (docsErr) {
      // Fallback: upload as .html file
      console.warn(`${LOG} Docs creation failed, falling back to HTML upload:`, docsErr);
      const res = await drive.files.create({
        requestBody: {
          name: `${docTitle}.html`,
          parents: [folderId],
        },
        media: {
          mimeType: 'text/html',
          body: Readable.from(html),
        },
        fields: 'id, webViewLink',
      });
      docId = res.data.id!;
      docUrl = res.data.webViewLink || `https://drive.google.com/file/d/${docId}/view`;
    }
  }

  // Update content_items row
  await supabaseAdmin
    .from('content_items')
    .update({ brief_doc_id: docId, brief_doc_url: docUrl })
    .eq('id', contentItemId);

  console.log(`${LOG} Created/updated brief doc: ${docId}`);
  return { docId, docUrl };
}
