import { createBrowserClient } from "@supabase/ssr";

// Browser client. Only the anon key is exposed here; all data access goes through
// server functions, so this is used solely for auth-related client flows.
let client: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
  }
  return client;
}
