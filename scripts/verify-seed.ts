import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

process.loadEnvFile(".env.local");

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function countRows(
  table:
    | "resources"
    | "resource_rate_history"
    | "projects"
    | "workplan_tasks"
    | "workplan_task_resources"
    | "deliverables"
    | "narrative_sections"
    | "workplan_snapshots",
  filter?: { column: string; value: string | boolean },
) {
  let q = supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (filter) {
    q = q.eq(filter.column, filter.value as never);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const { data: project } = await supabase
    .from("projects")
    .select("id, slug, total_hours_baseline, total_cost_baseline")
    .eq("slug", "a26-0057")
    .single();
  if (!project) throw new Error("no project");

  const resources = await countRows("resources");
  const rates = await countRows("resource_rate_history");
  const projects = await countRows("projects");
  const tasks = await countRows("workplan_tasks", {
    column: "project_id",
    value: project.id,
  });
  const milestones = await countRows("workplan_tasks", {
    column: "project_id",
    value: project.id,
  });
  const milestonesOnly = await supabase
    .from("workplan_tasks")
    .select("*", { count: "exact", head: true })
    .eq("project_id", project.id)
    .eq("is_milestone", true);
  const assignments = await supabase
    .from("workplan_task_resources")
    .select("*, workplan_tasks!inner(project_id)", {
      count: "exact",
      head: true,
    })
    .eq("workplan_tasks.project_id", project.id);
  const deliverables = await countRows("deliverables", {
    column: "project_id",
    value: project.id,
  });
  const narrative = await countRows("narrative_sections", {
    column: "project_id",
    value: project.id,
  });
  const snapshots = await supabase
    .from("workplan_snapshots")
    .select("id, snapshot_label, version_number", { count: "exact" })
    .eq("project_id", project.id);

  const { data: hoursAgg } = await supabase
    .from("workplan_task_resources")
    .select("hours, workplan_tasks!inner(project_id, is_milestone)")
    .eq("workplan_tasks.project_id", project.id);
  const totalHours =
    (hoursAgg ?? []).reduce((s: number, r: { hours: number }) => s + Number(r.hours), 0);

  console.log("== Seed rowcounts ==");
  console.log(`projects:                 ${projects} (total)`);
  console.log(`resources:                ${resources}`);
  console.log(`resource_rate_history:    ${rates}`);
  console.log(`workplan_tasks:           ${tasks}`);
  console.log(`  of which milestones:    ${milestonesOnly.count ?? "?"}`);
  console.log(`workplan_task_resources:  ${assignments.count ?? "?"}`);
  console.log(`  sum of hours:           ${totalHours} (baseline ${project.total_hours_baseline})`);
  console.log(`deliverables:             ${deliverables}`);
  console.log(`narrative_sections:       ${narrative}`);
  console.log(`workplan_snapshots:       ${snapshots.count ?? "?"}`);
  if (snapshots.data) {
    for (const s of snapshots.data) {
      console.log(
        `  snapshot #${s.version_number}: ${s.snapshot_label}`,
      );
    }
  }
  void milestones;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
