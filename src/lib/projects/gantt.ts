import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  computeCriticalPath,
  type DependencyEdge,
  type TaskNode,
  type ScheduleAnalysis,
  inclusiveDays,
} from "@/lib/schedule/critical-path";

type TaskRow = Database["public"]["Tables"]["workplan_tasks"]["Row"];
type DepRow = Database["public"]["Tables"]["task_dependencies"]["Row"];

export type GanttData = {
  tasks: TaskRow[];
  dependencies: DepRow[];
  analysis: Map<string, ScheduleAnalysis>;
  projectStart: Date;
  projectEnd: Date;
};

export async function loadGanttData(projectId: string): Promise<GanttData> {
  const supabase = await createClient();
  const [tasksRes, depsRes] = await Promise.all([
    supabase
      .from("workplan_tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("task_dependencies")
      .select("*")
      .eq("project_id", projectId),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (depsRes.error) throw depsRes.error;

  const tasks = tasksRes.data ?? [];
  const deps = depsRes.data ?? [];

  // PM tasks are excluded from CPM per PMI level-of-effort convention —
  // they parallel the full project span and don't gate downstream work.
  // They still render on the Gantt (in the PM swim lane) but force
  // is_on_critical_path: false in the analysis so the red treatment lands
  // on real scope-work tasks instead of oversight.
  const isPmTask = (t: (typeof tasks)[number]) => t.phase === "PM";

  const nodes: TaskNode[] = tasks
    .filter((t) => t.start_date && t.finish_date && !isPmTask(t))
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

  let analysis: Map<string, ScheduleAnalysis>;
  try {
    analysis = computeCriticalPath(nodes, edges);
  } catch (err) {
    // Cycle — return empty analysis so the page still renders
    console.error("Critical path error:", err);
    analysis = new Map();
  }

  // Add placeholder entries for PM tasks so the Gantt can still look up
  // each task's analysis; is_on_critical_path is explicitly false.
  for (const t of tasks) {
    if (!isPmTask(t) || !t.start_date || !t.finish_date) continue;
    const start = new Date(t.start_date);
    const finish = new Date(t.finish_date);
    analysis.set(t.id, {
      task_id: t.id,
      early_start: start,
      early_finish: finish,
      late_start: start,
      late_finish: finish,
      total_float_days: 0,
      is_on_critical_path: false,
    });
  }

  const projectStart =
    nodes.length > 0
      ? new Date(
          Math.min(...nodes.map((n) => n.start_date.getTime())),
        )
      : new Date();
  const projectEnd =
    nodes.length > 0
      ? new Date(
          Math.max(...nodes.map((n) => n.finish_date.getTime())),
        )
      : new Date();

  return { tasks, dependencies: deps, analysis, projectStart, projectEnd };
}
