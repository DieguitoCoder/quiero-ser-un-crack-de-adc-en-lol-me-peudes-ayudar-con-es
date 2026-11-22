/** Supabase clients (the ONLY place that imports @supabase/*, with session-middleware.ts). */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/server-env";

/** Cookie-bound client for the current request (anon key). */
export async function createSessionClient(): Promise<SupabaseClient> {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error("Supabase env vars are not configured");
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // called from a Server Component: middleware refreshes the session instead
        }
      },
    },
  });
}

/** Service-role client: auth admin only (create/delete users, RSO). Never expose to the browser. */
export function createAdminClient(): SupabaseClient {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
