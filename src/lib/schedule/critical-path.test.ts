import { describe, it, expect } from "vitest";
import { computeCriticalPath, type TaskNode, type DependencyEdge } from "./critical-path";

function d(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function task(
  id: string,
  startISO: string,
  durationDays: number,
  isMilestone = false,
): TaskNode {
  const start = d(startISO);
  const finish = new Date(start);
  finish.setUTCDate(finish.getUTCDate() + durationDays);
  return {
    id,
    start_date: start,
    finish_date: finish,
    duration_days: durationDays,
    is_milestone: isMilestone,
  };
}

function edge(pred: string, succ: string, lag = 0): DependencyEdge {
  return { predecessor_id: pred, successor_id: succ, lag_days: lag };
}

describe("computeCriticalPath", () => {
  it("linear chain: every task is critical, float = 0", () => {
    const tasks = [
      task("A", "2026-05-01", 5),
      task("B", "2026-05-06", 3),
      task("C", "2026-05-09", 7),
    ];
    const deps = [edge("A", "B"), edge("B", "C")];
    const r = computeCriticalPath(tasks, deps);
    for (const id of ["A", "B", "C"]) {
      expect(r.get(id)!.total_float_days).toBe(0);
      expect(r.get(id)!.is_on_critical_path).toBe(true);
    }
  });

  it("branching: longer branch is critical, shorter branch has float", () => {
    // A → B → D (B=10, D=5)  long branch = 10+5=15
    // A → C → D (C=3, D=5)   short branch = 3+5=8
    const tasks = [
      task("A", "2026-05-01", 2),
      task("B", "2026-05-03", 10),
      task("C", "2026-05-03", 3),
      task("D", "2026-05-13", 5),
    ];
    const deps = [edge("A", "B"), edge("A", "C"), edge("B", "D"), edge("C", "D")];
    const r = computeCriticalPath(tasks, deps);
    expect(r.get("A")!.is_on_critical_path).toBe(true);
    expect(r.get("B")!.is_on_critical_path).toBe(true);
    expect(r.get("D")!.is_on_critical_path).toBe(true);
    // C has float equal to the difference between B's duration and C's
    expect(r.get("C")!.total_float_days).toBe(10 - 3);
    expect(r.get("C")!.is_on_critical_path).toBe(false);
  });

  it("parallel independent tasks: each gets float relative to project end", () => {
    // A alone (5 days), B alone (3 days), no deps. Project end = max(EF) = 5.
    // B has float = 5 - 3 = 2
    const tasks = [task("A", "2026-05-01", 5), task("B", "2026-05-01", 3)];
    const r = computeCriticalPath(tasks, []);
    expect(r.get("A")!.is_on_critical_path).toBe(true);
    expect(r.get("A")!.total_float_days).toBe(0);
    expect(r.get("B")!.total_float_days).toBe(2);
    expect(r.get("B")!.is_on_critical_path).toBe(false);
  });

  it("task with no deps is critical if on longest chain", () => {
    // A (alone, 7 days) vs B→C (3+3=6 days). A is critical.
    const tasks = [
      task("A", "2026-05-01", 7),
      task("B", "2026-05-01", 3),
      task("C", "2026-05-04", 3),
    ];
    const deps = [edge("B", "C")];
    const r = computeCriticalPath(tasks, deps);
    expect(r.get("A")!.is_on_critical_path).toBe(true);
    expect(r.get("B")!.total_float_days).toBe(1);
    expect(r.get("C")!.total_float_days).toBe(1);
  });

  it("lag days extend the schedule", () => {
    // A (3 days) → [lag 2] → B (5 days). Project end = 3 + 2 + 5 = 10.
    const tasks = [task("A", "2026-05-01", 3), task("B", "2026-05-06", 5)];
    const deps = [edge("A", "B", 2)];
    const r = computeCriticalPath(tasks, deps);
    // A is on critical path
    expect(r.get("A")!.total_float_days).toBe(0);
    expect(r.get("B")!.total_float_days).toBe(0);
    // Project duration = 10: verify B's LF matches
    const bFinish = r.get("B")!.late_finish;
    const aStart = r.get("A")!.early_start;
    const diffDays = Math.round(
      (bFinish.getTime() - aStart.getTime()) / 86_400_000,
    );
    expect(diffDays).toBe(10);
  });

  it("throws clear error on cycle", () => {
    const tasks = [
      task("A", "2026-05-01", 3),
      task("B", "2026-05-04", 3),
      task("C", "2026-05-07", 3),
    ];
    const deps = [edge("A", "B"), edge("B", "C"), edge("C", "A")];
    expect(() => computeCriticalPath(tasks, deps)).toThrow(/cycle/i);
  });

  it("handles empty input", () => {
    const r = computeCriticalPath([], []);
    expect(r.size).toBe(0);
  });

  it("milestones (duration 0) propagate schedule but don't add length", () => {
    // A (5 days) → M (0 days milestone) → B (3 days). Project = 5 + 0 + 3 = 8.
    const tasks = [
      task("A", "2026-05-01", 5),
      task("M", "2026-05-06", 0, true),
      task("B", "2026-05-06", 3),
    ];
    const deps = [edge("A", "M"), edge("M", "B")];
    const r = computeCriticalPath(tasks, deps);
    expect(r.get("A")!.is_on_critical_path).toBe(true);
    expect(r.get("M")!.is_on_critical_path).toBe(true);
    expect(r.get("B")!.is_on_critical_path).toBe(true);
    expect(r.get("M")!.total_float_days).toBe(0);
  });
});
