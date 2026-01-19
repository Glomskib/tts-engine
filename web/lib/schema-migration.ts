import { supabaseAdmin } from "./supabaseAdmin";

export async function checkAndMigrateSchema() {
  const results = {
    accounts: { exists: false, created: false },
    videos: { account_id: false, added: false },
    variants: { status: false, added: false },
    errors: [] as string[]
  };

  try {
    // Check if accounts table exists
    const { data: accountsCheck, error: accountsError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .limit(1);

    if (accountsError && accountsError.code === "42P01") {
      // Table doesn't exist, create it
      const { error: createError } = await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.accounts (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            platform text DEFAULT 'tiktok',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
        `
      });
      
      if (createError) {
        results.errors.push(`Failed to create accounts table: ${createError.message}`);
      } else {
        results.accounts.created = true;
      }
    } else if (!accountsError) {
      results.accounts.exists = true;
    }

    // Check if videos.account_id exists
    const { data: videosColumns, error: videosError } = await supabaseAdmin
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_name", "videos")
      .eq("table_schema", "public")
      .eq("column_name", "account_id");

    if (!videosError && videosColumns.length === 0) {
      // Column doesn't exist, add it
      const { error: addColumnError } = await supabaseAdmin.rpc('exec_sql', {
        sql: `ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS account_id uuid;`
      });
      
      if (addColumnError) {
        results.errors.push(`Failed to add account_id to videos: ${addColumnError.message}`);
      } else {
        results.videos.added = true;
      }
    } else if (!videosError && videosColumns.length > 0) {
      results.videos.account_id = true;
    }

    // Check if variants.status exists
    const { data: variantsColumns, error: variantsError } = await supabaseAdmin
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_name", "variants")
      .eq("table_schema", "public")
      .eq("column_name", "status");

    if (!variantsError && variantsColumns.length === 0) {
      // Column doesn't exist, add it
      const { error: addStatusError } = await supabaseAdmin.rpc('exec_sql', {
        sql: `ALTER TABLE public.variants ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';`
      });
      
      if (addStatusError) {
        results.errors.push(`Failed to add status to variants: ${addStatusError.message}`);
      } else {
        results.variants.added = true;
      }
    } else if (!variantsError && variantsColumns.length > 0) {
      results.variants.status = true;
    }

  } catch (error) {
    results.errors.push(`Schema migration error: ${error}`);
  }

  return results;
}

// Status constants
export const VARIANT_STATUSES = ["draft", "approved", "killed", "winner"] as const;
export const VIDEO_STATUSES = ["needs_edit", "ready_to_upload", "posted", "blocked", "needs_revision"] as const;

export type VariantStatus = typeof VARIANT_STATUSES[number];
export type VideoStatus = typeof VIDEO_STATUSES[number];
