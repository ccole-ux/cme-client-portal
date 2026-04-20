/**
 * One-off maintenance: rename the ACTC PCS project to agreement A26-0057.
 * Updates projects.name, description, slug.
 *
 * Run once: npx tsx scripts/rename-project-to-a26-0057.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

process.loadEnvFile(".env.local");

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const NEW_NAME = "A26-0057";
const NEW_SLUG = "a26-0057";
const NEW_DESCRIPTION =
  "Master workplan for Agreement A26-0057 with Alameda County Transportation Commission. Rates per B7 R26-003. Covers Phase 1 Core MVP, Phase 1.5 AI Data Access, Phase 2 Extended Modules, Phase 3 Optimization, and Project Management across May 2026 through April 2027.";

async function main() {
  // Find by either old or new slug so the script is idempotent.
  const { data: existing, error: findErr } = await supabase
    .from("projects")
    .select("id, name, slug")
    .in("slug", ["actc-pcs", NEW_SLUG])
    .maybeSingle();
  if (findErr) throw findErr;
  if (!existing) {
    throw new Error("Project not found under either slug — run the seed first.");
  }

  console.log(`Found: ${existing.name} (slug=${existing.slug})`);

  const { error: updErr } = await supabase
    .from("projects")
    .update({
      name: NEW_NAME,
      slug: NEW_SLUG,
      description: NEW_DESCRIPTION,
    })
    .eq("id", existing.id);
  if (updErr) throw updErr;

  const { data: after } = await supabase
    .from("projects")
    .select("name, slug, description")
    .eq("id", existing.id)
    .single();
  console.log("After:");
  console.log(JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
