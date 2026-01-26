/**
 * video-assets.ts
 *
 * Structured asset management for videos.
 * Handles asset naming conventions, validation, and CRUD operations.
 *
 * Asset types: raw, edit_project, export, final_mp4, thumbnail, screenshot, misc
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export const ASSET_TYPES = [
  "raw",
  "edit_project",
  "export",
  "final_mp4",
  "thumbnail",
  "screenshot",
  "misc",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const STORAGE_PROVIDERS = ["local", "gdrive", "s3", "azure", "dropbox"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export interface VideoAsset {
  id: string;
  video_id: string;
  asset_type: AssetType;
  storage_provider: StorageProvider;
  uri: string;
  file_name: string;
  mime_type: string | null;
  byte_size: number | null;
  checksum: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AssetInput {
  asset_type: AssetType;
  storage_provider?: StorageProvider;
  uri: string;
  file_name: string;
  mime_type?: string | null;
  byte_size?: number | null;
  checksum?: string | null;
}

export interface AssetValidationResult {
  ok: boolean;
  errors: { field: string; message: string }[];
}

export interface AssetsByType {
  [key: string]: VideoAsset[];
}

export interface AssetsCheckResult {
  ok: boolean;
  has_final_mp4: boolean;
  missing: string[];
  assets_by_type: AssetsByType;
}

// ============================================================================
// Validation Functions (Single Source of Truth)
// ============================================================================

/**
 * Validate asset type.
 */
export function isValidAssetType(type: string): type is AssetType {
  return ASSET_TYPES.includes(type as AssetType);
}

/**
 * Validate storage provider.
 */
export function isValidStorageProvider(provider: string): provider is StorageProvider {
  return STORAGE_PROVIDERS.includes(provider as StorageProvider);
}

/**
 * Validate asset input for POST endpoint.
 */
export function validateAssetInput(input: Partial<AssetInput>): AssetValidationResult {
  const errors: { field: string; message: string }[] = [];

  // asset_type is required
  if (!input.asset_type) {
    errors.push({ field: "asset_type", message: "asset_type is required" });
  } else if (!isValidAssetType(input.asset_type)) {
    errors.push({
      field: "asset_type",
      message: `asset_type must be one of: ${ASSET_TYPES.join(", ")}`,
    });
  }

  // uri is required
  if (!input.uri) {
    errors.push({ field: "uri", message: "uri is required" });
  } else if (typeof input.uri !== "string" || input.uri.trim().length === 0) {
    errors.push({ field: "uri", message: "uri must be a non-empty string" });
  }

  // file_name is required
  if (!input.file_name) {
    errors.push({ field: "file_name", message: "file_name is required" });
  } else if (typeof input.file_name !== "string" || input.file_name.trim().length === 0) {
    errors.push({ field: "file_name", message: "file_name must be a non-empty string" });
  }

  // storage_provider validation (if provided)
  if (input.storage_provider !== undefined && !isValidStorageProvider(input.storage_provider)) {
    errors.push({
      field: "storage_provider",
      message: `storage_provider must be one of: ${STORAGE_PROVIDERS.join(", ")}`,
    });
  }

  // mime_type validation (if provided)
  if (input.mime_type !== undefined && input.mime_type !== null) {
    if (typeof input.mime_type !== "string") {
      errors.push({ field: "mime_type", message: "mime_type must be a string" });
    }
  }

  // byte_size validation (if provided)
  if (input.byte_size !== undefined && input.byte_size !== null) {
    if (typeof input.byte_size !== "number" || input.byte_size < 0) {
      errors.push({ field: "byte_size", message: "byte_size must be a non-negative number" });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Check if video has required assets for posting.
 * Returns whether final_mp4 asset exists.
 */
export function validateAssetsForPosting(assets: VideoAsset[]): AssetsCheckResult {
  const activeAssets = assets.filter((a) => a.deleted_at === null);

  // Group by type
  const assetsByType: AssetsByType = {};
  for (const asset of activeAssets) {
    if (!assetsByType[asset.asset_type]) {
      assetsByType[asset.asset_type] = [];
    }
    assetsByType[asset.asset_type].push(asset);
  }

  const hasFinalMp4 = (assetsByType["final_mp4"]?.length || 0) > 0;
  const missing: string[] = [];

  if (!hasFinalMp4) {
    missing.push("final_mp4");
  }

  return {
    ok: hasFinalMp4,
    has_final_mp4: hasFinalMp4,
    missing,
    assets_by_type: assetsByType,
  };
}

// ============================================================================
// Naming Convention Helper (Single Source of Truth)
// ============================================================================

/**
 * File extension mapping for asset types.
 */
const ASSET_TYPE_EXTENSIONS: Record<AssetType, string> = {
  raw: "mov",
  edit_project: "prproj",
  export: "mp4",
  final_mp4: "mp4",
  thumbnail: "jpg",
  screenshot: "png",
  misc: "bin",
};

/**
 * Generate a canonical file name for an asset.
 *
 * Format: {account}_{variant}_{video}_{type}_{date}.{ext}
 *
 * @param params - Naming parameters
 * @returns Deterministic canonical file name
 */
export function generateCanonicalFileName(params: {
  video_id: string;
  variant_id?: string | null;
  account_id?: string | null;
  asset_type: AssetType;
  version?: number;
  extension?: string;
}): string {
  const { video_id, variant_id, account_id, asset_type, version, extension } = params;

  // Use short IDs (first 8 chars of UUID) for readability
  const shortVideoId = video_id.substring(0, 8);
  const shortVariantId = variant_id ? variant_id.substring(0, 8) : "novar";
  const shortAccountId = account_id ? account_id.substring(0, 8) : "noacct";

  // Date in YYYYMMDD format
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Version string
  const versionStr = version ? `v${version}` : "v1";

  // Extension (use provided or default based on asset type)
  const ext = extension || ASSET_TYPE_EXTENSIONS[asset_type] || "bin";

  // Build canonical name
  // Format: {account}_{variant}_{video}_{type}_{version}_{date}.{ext}
  return `${shortAccountId}_${shortVariantId}_${shortVideoId}_${asset_type}_${versionStr}_${date}.${ext}`;
}

/**
 * Parse extension from a file name.
 */
export function getExtensionFromFileName(fileName: string): string {
  const parts = fileName.split(".");
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase();
  }
  return "";
}

// ============================================================================
// Video Event Writer
// ============================================================================

async function writeVideoEvent(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    event_type: string;
    correlation_id: string;
    actor: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("video_events").insert({
      video_id: params.video_id,
      event_type: params.event_type,
      correlation_id: params.correlation_id,
      actor: params.actor,
      from_status: null,
      to_status: null,
      details: params.details,
    });
  } catch (err) {
    console.error(`Failed to write video event ${params.event_type}:`, err);
  }
}

// ============================================================================
// Data Access Functions
// ============================================================================

/**
 * Get all active assets for a video.
 */
export async function getVideoAssets(
  supabase: SupabaseClient,
  video_id: string
): Promise<{ ok: boolean; assets: VideoAsset[]; error?: string }> {
  const { data, error } = await supabase
    .from("video_assets")
    .select("*")
    .eq("video_id", video_id)
    .is("deleted_at", null)
    .order("asset_type")
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, assets: [], error: error.message };
  }

  return { ok: true, assets: (data || []) as VideoAsset[] };
}

/**
 * Get a single asset by ID.
 */
export async function getAssetById(
  supabase: SupabaseClient,
  asset_id: string
): Promise<{ ok: boolean; asset: VideoAsset | null; error?: string }> {
  const { data, error } = await supabase
    .from("video_assets")
    .select("*")
    .eq("id", asset_id)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { ok: false, asset: null, error: "Asset not found" };
    }
    return { ok: false, asset: null, error: error.message };
  }

  return { ok: true, asset: data as VideoAsset };
}

/**
 * Upsert an asset record.
 * If an asset of the same type exists for this video, it will be updated.
 */
export async function upsertVideoAsset(
  supabase: SupabaseClient,
  params: {
    video_id: string;
    input: AssetInput;
    actor: string;
    correlation_id: string;
  }
): Promise<{ ok: boolean; asset: VideoAsset | null; action: "added" | "updated"; error?: string }> {
  const { video_id, input, actor, correlation_id } = params;

  // Check if asset of this type already exists
  const { data: existing } = await supabase
    .from("video_assets")
    .select("*")
    .eq("video_id", video_id)
    .eq("asset_type", input.asset_type)
    .is("deleted_at", null)
    .maybeSingle();

  const assetData = {
    video_id,
    asset_type: input.asset_type,
    storage_provider: input.storage_provider || "local",
    uri: input.uri,
    file_name: input.file_name,
    mime_type: input.mime_type || null,
    byte_size: input.byte_size || null,
    checksum: input.checksum || null,
    created_by: actor,
  };

  let result;
  let action: "added" | "updated";

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from("video_assets")
      .update({
        ...assetData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      return { ok: false, asset: null, action: "updated", error: error.message };
    }
    result = data;
    action = "updated";
  } else {
    // Insert new
    const { data, error } = await supabase
      .from("video_assets")
      .insert(assetData)
      .select()
      .single();

    if (error) {
      return { ok: false, asset: null, action: "added", error: error.message };
    }
    result = data;
    action = "added";
  }

  // Write audit event
  await writeVideoEvent(supabase, {
    video_id,
    event_type: action === "added" ? "asset_added" : "asset_updated",
    correlation_id,
    actor,
    details: {
      asset_id: result.id,
      asset_type: input.asset_type,
      file_name: input.file_name,
      uri: input.uri,
      storage_provider: input.storage_provider || "local",
      previous_asset: existing ? { id: existing.id, uri: existing.uri, file_name: existing.file_name } : null,
    },
  });

  return { ok: true, asset: result as VideoAsset, action };
}

/**
 * Soft delete an asset.
 */
export async function deleteVideoAsset(
  supabase: SupabaseClient,
  params: {
    asset_id: string;
    video_id: string;
    actor: string;
    correlation_id: string;
    is_admin?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { asset_id, video_id, actor, correlation_id, is_admin } = params;

  // Fetch the asset
  const { data: asset, error: fetchError } = await supabase
    .from("video_assets")
    .select("*")
    .eq("id", asset_id)
    .eq("video_id", video_id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !asset) {
    return { ok: false, error: "Asset not found" };
  }

  // Check ownership (admin can delete any, others only their own)
  if (!is_admin && asset.created_by !== actor) {
    return { ok: false, error: "Not authorized to delete this asset" };
  }

  // Soft delete
  const { error: deleteError } = await supabase
    .from("video_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", asset_id);

  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  // Write audit event
  await writeVideoEvent(supabase, {
    video_id,
    event_type: "asset_removed",
    correlation_id,
    actor,
    details: {
      asset_id,
      asset_type: asset.asset_type,
      file_name: asset.file_name,
      uri: asset.uri,
      deleted_by: actor,
      was_admin_action: is_admin && asset.created_by !== actor,
    },
  });

  return { ok: true };
}

/**
 * Check if video has final_mp4 asset.
 * Used for transition gate.
 */
export async function hasFinalAsset(
  supabase: SupabaseClient,
  video_id: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("video_assets")
    .select("*", { count: "exact", head: true })
    .eq("video_id", video_id)
    .eq("asset_type", "final_mp4")
    .is("deleted_at", null);

  if (error) {
    console.error("Error checking final asset:", error);
    return false;
  }

  return (count || 0) > 0;
}
