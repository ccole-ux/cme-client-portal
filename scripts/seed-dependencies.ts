/**
 * Seed Session 4 baseline task dependencies. Idempotent: uses upsert on
 * (predecessor_task_id, successor_task_id).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

process.loadEnvFile(".env.local");

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const PROJECT_SLUG = "a26-0057";
const CME_ADMIN_EMAIL = "ccole@cole-mgtandeng.com";

// Chain of dependencies from the session 4 kickoff, expressed as
// [predecessor_wbs, successor_wbs].
const EDGES: [string, string][] = [
  // Original Session 4 baseline
  ["1.0.3", "1.1.1"],
  ["1.0.3", "1.11.1"],
  ["1.1.1", "1.2.1"],
  ["1.1.1", "1.3.1"],
  ["1.1.1", "1.4.1"],
  ["1.1.1", "1.5.5"],
  ["1.1.1", "1.6.1"],
  ["1.11.5", "M3.5"],
  ["M3.5", "1.7.2"],
  ["1.7.2", "M4"],
  ["M4", "1.9.3"],
  ["1.9.3", "1.9.4"],
  ["1.10.2", "M5"],
  ["M5", "1.5A.1"],
  ["1.5A.3", "M6"],
  ["M7", "3.1"],
  ["3.5", "M8"],
  // Session 4 polish — complete the build chain so the critical path
  // traces the real scope sequence, not PM oversight.
  ["1.2.1", "1.3.1"],
  ["1.3.1", "1.4.1"],
  ["1.4.1", "1.5.5"],
  ["1.5.5", "1.5.7"],
  ["1.5.7", "1.10.2"],
  ["1.6.2", "M3"],
  ["1.5.7", "M3"],
  ["1.10.3", "M5"],
  // (M5 → 1.5A.1 and 1.5A.3 → M6 already seeded above)
  ["M6", "2.1"],
  ["2.11", "M7"],
  // (M7 → 3.1 already seeded above)
  ["3.9", "M8"],
];

async function main() {
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", PROJECT_SLUG)
    .single();
  if (!project) throw new Error(`Project ${PROJECT_SLUG} not found`);

  const { data: admin } = await supabase
    .from("users")
    .select("id")
    .eq("email", CME_ADMIN_EMAIL)
    .single();
  if (!admin) {
    throw new Error(
      `CME admin ${CME_ADMIN_EMAIL} not found — sign in once before seeding.`,
    );
  }

  const { data: tasks } = await supabase
    .from("workplan_tasks")
    .select("id, wbs")
    .eq("project_id", project.id);
  if (!tasks) throw new Error("failed to load tasks");
  const idByWbs = new Map(tasks.map((t) => [t.wbs, t.id]));

  const payload: {
    project_id: string;
    predecessor_task_id: string;
    successor_task_id: string;
    dependency_type: "finish_to_start";
    lag_days: number;
    created_by: string;
  }[] = [];
  const missing: string[] = [];

  for (const [predWbs, succWbs] of EDGES) {
    const pred = idByWbs.get(predWbs);
    const succ = idByWbs.get(succWbs);
    if (!pred || !succ) {
      missing.push(`${predWbs} -> ${succWbs} (missing ${!pred ? predWbs : succWbs})`);
      continue;
    }
    payload.push({
      project_id: project.id,
      predecessor_task_id: pred,
      successor_task_id: succ,
      dependency_type: "finish_to_start",
      lag_days: 0,
      created_by: admin.id,
    });
  }

  if (missing.length) {
    console.warn(`WARNING: ${missing.length} edges skipped due to missing WBS:`);
    for (const m of missing) console.warn(`  ${m}`);
  }

  const { error } = await supabase
    .from("task_dependencies")
    .upsert(payload, {
      onConflict: "predecessor_task_id,successor_task_id",
      ignoreDuplicates: true,
    });
  if (error) throw error;

  const { count } = await supabase
    .from("task_dependencies")
    .select("*", { count: "exact", head: true })
    .eq("project_id", project.id);

  console.log(
    `Upserted ${payload.length} dependency edges (${missing.length} skipped). Total in DB for project: ${count}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
