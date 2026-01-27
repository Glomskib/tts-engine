import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabaseClient: SupabaseClient | null = null;

/**
 * Get the Supabase client (lazy initialization).
 * Validates env vars at first use, not at import time, to avoid build failures.
 */
function getSupabaseClient(): SupabaseClient {
  if (_supabaseClient) {
    return _supabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is required. " +
      "Add it to your .env.local file or Vercel environment variables."
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is required. " +
      "Add it to your .env.local file or Vercel environment variables."
    );
  }

  _supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  return _supabaseClient;
}

// Export as a getter to maintain the same API (supabaseClient.from(...))
export const supabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = client[prop as keyof SupabaseClient];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
