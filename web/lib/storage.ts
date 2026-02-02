// lib/storage.ts - Supabase storage utilities for file uploads
import { supabaseAdmin } from './supabaseAdmin';

export interface UploadResult {
  url: string;
  path: string;
  size: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

// Allowed image types
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

// Max file size (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Upload file to Supabase storage
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: {
    contentType?: string;
    upsert?: boolean;
  }
): Promise<UploadResult> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, file, {
      contentType: options?.contentType || (file instanceof File ? file.type : 'application/octet-stream'),
      upsert: options?.upsert ?? false,
    });

  if (error) {
    console.error('[Storage] Upload error:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get the public URL
  const { data: urlData } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    path: data.path,
    size: file.size,
  };
}

// Delete file from Supabase storage
export async function deleteFromStorage(
  bucket: string,
  path: string
): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    console.error('[Storage] Delete error:', error);
    throw new Error(`Delete failed: ${error.message}`);
  }
}

// Generate unique file path for user uploads
export function generateFilePath(
  userId: string,
  folder: string,
  filename: string
): string {
  const timestamp = Date.now();
  const ext = filename.split('.').pop() || 'png';
  const safeFilename = filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9-_]/g, '_') // Sanitize
    .substring(0, 50); // Limit length

  return `${userId}/${folder}/${timestamp}-${safeFilename}.${ext}`;
}

// Validate image file
export function validateImageFile(
  file: File,
  options?: {
    maxSize?: number;
    allowedTypes?: string[];
  }
): { valid: boolean; error?: string } {
  const maxSize = options?.maxSize || MAX_FILE_SIZE;
  const allowedTypes = options?.allowedTypes || ALLOWED_IMAGE_TYPES;

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`,
    };
  }

  if (file.size > maxSize) {
    const sizeMB = Math.round(maxSize / 1024 / 1024);
    return {
      valid: false,
      error: `File too large. Max size: ${sizeMB}MB`,
    };
  }

  return { valid: true };
}

// Convert base64 to Blob
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64.split(',')[1] || base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], { type: mimeType });
}

// Upload reference image from URL (for external URLs)
export async function uploadFromUrl(
  bucket: string,
  path: string,
  url: string
): Promise<UploadResult> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${response.status}`);
  }

  const blob = await response.blob();
  const contentType = response.headers.get('content-type') || 'image/png';

  return uploadToStorage(bucket, path, blob, { contentType });
}
