import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-only admin client. Uses the secret (service-role-equivalent) key —
 * bypasses RLS. Only instantiate inside server code that has already
 * authorized the caller.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
