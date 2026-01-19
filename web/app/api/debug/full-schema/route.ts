import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const tables = ["products", "concepts"];
  const schemaInfo: Record<string, any> = {};

  for (const table of tables) {
    // Test all possible columns for each table
    const testColumns = {
      products: ["id", "name", "brand", "category", "category_risk", "notes", "primary_link", "risk", "tags", "created_at", "updated_at"],
      concepts: ["id", "product_id", "title", "source_url", "notes", "created_at", "updated_at"]
    };

    const columnTests: Record<string, boolean> = {};
    
    for (const col of testColumns[table as keyof typeof testColumns] || []) {
      const { error } = await supabaseAdmin
        .from(table)
        .select(col)
        .limit(1);
      columnTests[col] = !error;
    }

    // Try to get sample data
    const { data: sampleData, error: sampleError } = await supabaseAdmin
      .from(table)
      .select("*")
      .limit(1);

    // Test insert with minimal data to check NOT NULL constraints
    let insertTest = null;
    if (table === "products") {
      const { error: insertError } = await supabaseAdmin
        .from("products")
        .insert({ name: "TEST_VALIDATION_DELETE_ME" })
        .select()
        .single();
      insertTest = insertError?.message || "success";
    }

    schemaInfo[table] = {
      columnTests,
      sampleData: sampleData?.[0] || null,
      sampleError: sampleError?.message,
      insertTest,
      existingColumns: Object.entries(columnTests)
        .filter(([, exists]) => exists)
        .map(([col]) => col),
      missingColumns: Object.entries(columnTests)
        .filter(([, exists]) => !exists)
        .map(([col]) => col)
    };
  }

  return NextResponse.json({
    ok: true,
    schema: schemaInfo,
    recommendations: {
      products: {
        requiredFields: ["name", "brand", "category"],
        optionalFields: ["category_risk", "notes", "primary_link", "risk", "tags"],
        missingColumns: schemaInfo.products?.missingColumns || []
      },
      concepts: {
        requiredFields: ["product_id", "title"],
        optionalFields: ["source_url", "notes"],
        missingColumns: schemaInfo.concepts?.missingColumns || []
      }
    }
  });
}
