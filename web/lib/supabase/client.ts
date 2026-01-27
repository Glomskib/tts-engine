import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a Supabase client for browser-side operations.
 * Use this in Client Components.
 */
export function createBrowserSupabaseClient() {
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

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
