import { NextResponse } from "next/server";
import { checkAndMigrateSchema } from "@/lib/schema-migration";

export const runtime = "nodejs";

export async function POST() {
  try {
    const results = await checkAndMigrateSchema();
    
    return NextResponse.json({
      ok: true,
      results,
      summary: {
        accountsTable: results.accounts.exists || results.accounts.created,
        videosAccountId: results.videos.account_id || results.videos.added,
        variantsStatus: results.variants.status || results.variants.added,
        hasErrors: results.errors.length > 0
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Schema migration failed: ${error}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Just check schema without migrating
  try {
    const results = await checkAndMigrateSchema();
    
    return NextResponse.json({
      ok: true,
      results,
      needsMigration: !results.accounts.exists || !results.videos.account_id || !results.variants.status
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Schema check failed: ${error}` },
      { status: 500 }
    );
  }
}
