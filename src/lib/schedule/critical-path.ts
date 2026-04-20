/**
 * Classic Critical Path Method.
 *
 * Given task durations (independent of scheduled dates) and finish-to-start
 * dependencies with optional lag, compute for each task:
 *   - early_start, early_finish: earliest the task can run (forward pass)
 *   - late_start, late_finish:   latest the task can run without delaying the
 *                                project (backward pass)
 *   - total_float_days = late_start - early_start
 *   - is_on_critical_path: total_float_days == 0
 *
 * Dates returned are anchored at an arbitrary project_start epoch (the earliest
 * scheduled task start across the inputs) + ES/LF day offsets.
 */
import {
  addDays,
  differenceInCalendarDays,
  min as minDate,
} from "date-fns";

export type TaskNode = {
  id: string;
  start_date: Date;
  finish_date: Date;
  duration_days: number;
  is_milestone: boolean;
};

export type DependencyEdge = {
  predecessor_id: string;
  successor_id: string;
  lag_days: number;
};

export type ScheduleAnalysis = {
  task_id: string;
  early_start: Date;
  early_finish: Date;
  late_start: Date;
  late_finish: Date;
  total_float_days: number;
  is_on_critical_path: boolean;
};

export function computeCriticalPath(
  tasks: TaskNode[],
  dependencies: DependencyEdge[],
): Map<string, ScheduleAnalysis> {
  if (tasks.length === 0) return new Map();

  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Filter dependencies to ones referencing known tasks — stray FKs shouldn't
  // blow up the algorithm.
  const edges = dependencies.filter(
    (e) => byId.has(e.predecessor_id) && byId.has(e.successor_id),
  );

  const successorsOf = new Map<string, DependencyEdge[]>();
  const predecessorsOf = new Map<string, DependencyEdge[]>();
  for (const t of tasks) {
    successorsOf.set(t.id, []);
    predecessorsOf.set(t.id, []);
  }
  for (const e of edges) {
    successorsOf.get(e.predecessor_id)!.push(e);
    predecessorsOf.get(e.successor_id)!.push(e);
  }

  // Kahn's algorithm for topological sort; throws if a cycle is present.
  const indeg = new Map<string, number>();
  for (const t of tasks) {
    indeg.set(t.id, predecessorsOf.get(t.id)!.length);
  }
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of successorsOf.get(id)!) {
      const next = indeg.get(e.successor_id)! - 1;
      indeg.set(e.successor_id, next);
      if (next === 0) queue.push(e.successor_id);
    }
  }
  if (order.length !== tasks.length) {
    throw new Error(
      "Dependency graph contains a cycle — cannot compute critical path.",
    );
  }

  // Forward pass: ES, EF in day integers (project epoch = day 0).
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const preds = predecessorsOf.get(id)!;
    const task = byId.get(id)!;
    const earliest =
      preds.length === 0
        ? 0
        : Math.max(
            ...preds.map((e) => ef.get(e.predecessor_id)! + e.lag_days),
          );
    es.set(id, earliest);
    ef.set(id, earliest + task.duration_days);
  }

  const projectEndDay = Math.max(...[...ef.values()]);

  // Backward pass: LF, LS.
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const succs = successorsOf.get(id)!;
    const task = byId.get(id)!;
    const latestFinish =
      succs.length === 0
        ? projectEndDay
        : Math.min(
            ...succs.map((e) => ls.get(e.successor_id)! - e.lag_days),
          );
    lf.set(id, latestFinish);
    ls.set(id, latestFinish - task.duration_days);
  }

  // Anchor early dates to the earliest scheduled task start (for display).
  const projectStart = minDate(tasks.map((t) => t.start_date));

  const result = new Map<string, ScheduleAnalysis>();
  for (const t of tasks) {
    const esDay = es.get(t.id)!;
    const efDay = ef.get(t.id)!;
    const lsDay = ls.get(t.id)!;
    const lfDay = lf.get(t.id)!;
    const float = lsDay - esDay;
    result.set(t.id, {
      task_id: t.id,
      early_start: addDays(projectStart, esDay),
      early_finish: addDays(projectStart, efDay),
      late_start: addDays(projectStart, lsDay),
      late_finish: addDays(projectStart, lfDay),
      total_float_days: float,
      is_on_critical_path: float === 0,
    });
  }
  return result;
}

/**
 * Convenience: compute day-inclusive duration between two ISO dates.
 */
export function inclusiveDays(startISO: string, endISO: string): number {
  return differenceInCalendarDays(new Date(endISO), new Date(startISO)) + 1;
}
