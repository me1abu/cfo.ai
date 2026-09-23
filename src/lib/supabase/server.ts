import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";
import { serverEnv } from "@/lib/env.server";

/**
 * Supabase client bound to the current request's cookies. Use inside server
 * functions only. Session refreshes are written back as Set-Cookie headers.
 */
export function getSupabaseServerClient() {
  return createServerClient(serverEnv.VITE_SUPABASE_URL, serverEnv.VITE_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value: value ?? "" }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          setCookie(name, value, options);
        }
      },
    },
  });
}
