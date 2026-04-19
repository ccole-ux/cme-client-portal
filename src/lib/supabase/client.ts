import { createBrowserClient } from "@supabase/ssr";

// TODO(session-3): reintroduce <Database> typing once
// `npx supabase gen types typescript` runs against the live schema.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
