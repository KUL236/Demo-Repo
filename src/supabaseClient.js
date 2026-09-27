import { createClient } from "@supabase/supabase-js";

// These come from Netlify env vars (or a local .env file — see .env.example).
// Vite only exposes vars prefixed with VITE_ to the browser bundle.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't crash the build/preview — just warn loudly so it's obvious why
  // sign in/sign up won't work yet.
  // eslint-disable-next-line no-console
  console.warn(
    "[MailSecure] Missing Supabase env vars. Set VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_ANON_KEY locally in a .env file, and in Netlify under " +
      "Site configuration → Environment variables."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "public-anon-key-placeholder"
);
