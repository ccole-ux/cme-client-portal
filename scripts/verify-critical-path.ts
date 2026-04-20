import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";
import {
  computeCriticalPath,
  inclusiveDays,
  type DependencyEdge,
  type TaskNode,
} from "../src/lib/schedule/critical-path";

process.loadEnvFile(".env.local");

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", "a26-0057")
    .single();
  if (!project) throw new Error("project not found");

  const [tasksRes, depsRes] = await Promise.all([
    supabase
      .from("workplan_tasks")
      .select("id, wbs, task_name, start_date, finish_date, is_milestone, phase")
      .eq("project_id", project.id),
    supabase
      .from("task_dependencies")
      .select("predecessor_task_id, successor_task_id, lag_days")
      .eq("project_id", project.id),
  ]);

  const tasks = tasksRes.data!;
  const deps = depsRes.data!;

  // Mirror loadGanttData: PM excluded from CPM per PMI level-of-effort convention.
  const nodes: TaskNode[] = tasks
    .filter((t) => t.start_date && t.finish_date && t.phase !== "PM")
    .map((t) => ({
      id: t.id,
      start_date: new Date(t.start_date!),
      finish_date: new Date(t.finish_date!),
      duration_days: t.is_milestone
        ? 0
        : Math.max(1, inclusiveDays(t.start_date!, t.finish_date!) - 1),
      is_milestone: t.is_milestone,
    }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: DependencyEdge[] = deps
    .filter(
      (d) =>
        nodeIds.has(d.predecessor_task_id) &&
        nodeIds.has(d.successor_task_id),
    )
    .map((d) => ({
      predecessor_id: d.predecessor_task_id,
      successor_id: d.successor_task_id,
      lag_days: d.lag_days,
    }));

  const analysis = computeCriticalPath(nodes, edges);
  const critical = [...analysis.values()].filter((a) => a.is_on_critical_path);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  console.log(`Project ${project.name} (${project.slug})`);
  console.log(`Tasks with dates: ${nodes.length}, Dependencies: ${edges.length}`);
  console.log(`Critical path tasks: ${critical.length}`);

  const criticalWbs = critical
    .map((a) => byId.get(a.task_id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))
    .map((t) => `${t.wbs}${t.is_milestone ? "◆" : ""} ${t.task_name}`);

  console.log("\nCritical chain (ordered by start):");
  for (const c of criticalWbs) console.log(`  ${c}`);

  const maxFloat = Math.max(
    ...[...analysis.values()].map((a) => a.total_float_days),
  );
  console.log(`\nLongest non-critical float: ${maxFloat} days`);
  const projectDuration = Math.max(
    ...[...analysis.values()].map((a) => {
      const ms = a.late_finish.getTime() - a.early_start.getTime();
      return Math.round(ms / 86_400_000);
    }),
  );
  console.log(`Project CPM duration (day units): ${projectDuration}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
