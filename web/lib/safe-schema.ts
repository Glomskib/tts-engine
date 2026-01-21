import { supabaseAdmin } from './supabaseAdmin';

// Cache for table schemas to avoid repeated queries
const schemaCache = new Map<string, Set<string>>();

export async function getTableColumns(tableName: string, forceRefresh = false): Promise<Set<string>> {
  if (!forceRefresh && schemaCache.has(tableName)) {
    return schemaCache.get(tableName)!;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', tableName)
      .eq('table_schema', 'public');

    if (error) {
      console.error(`Failed to fetch ${tableName} columns:`, error);
      return new Set();
    }

    const columns = new Set(data?.map((row: any) => row.column_name) || []);
    schemaCache.set(tableName, columns);
    return columns;
  } catch (error) {
    console.error(`Error checking ${tableName} schema:`, error);
    return new Set();
  }
}

export async function safeColumnInsert(
  tableName: string, 
  payload: Record<string, unknown>,
  forceRefresh = false
): Promise<Record<string, unknown>> {
  const validColumns = await getTableColumns(tableName, forceRefresh);
  
  const safePayload: Record<string, unknown> = {};
  const droppedKeys: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (validColumns.has(key)) {
      safePayload[key] = value;
    } else {
      droppedKeys.push(key);
    }
  }

  if (droppedKeys.length > 0) {
    console.warn(`Dropped invalid columns for ${tableName}:`, droppedKeys);
  }

  return safePayload;
}

export function clearSchemaCache(tableName?: string) {
  if (tableName) {
    schemaCache.delete(tableName);
  } else {
    schemaCache.clear();
  }
}

// Generate correlation ID for request tracking
export function generateCorrelationId(): string {
  return `scale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
