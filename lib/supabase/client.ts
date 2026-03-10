import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Your project's URL and API key are required to create a Supabase client! " +
        "Check your Supabase project's API settings."
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
