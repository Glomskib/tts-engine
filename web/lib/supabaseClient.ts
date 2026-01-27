import { createClient } from "@supabase/supabase-js";

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

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
