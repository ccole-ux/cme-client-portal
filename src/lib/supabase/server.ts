import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// TODO(session-3): reintroduce <Database> typing once
// `npx supabase gen types typescript` runs against the live schema.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; proxy will refresh cookies.
          }
        },
      },
    },
  );
}
