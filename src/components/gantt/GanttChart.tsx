"use client";

/**
 * Gantt library evaluation — 2026-04-19.
 *
 * Chose `frappe-gantt@1.2.2` (MIT, ~30KB gz) after comparing against:
 * - `dhtmlx-gantt Standard` — RULED OUT. Standard build is GPL; permissive use
 *   requires a paid commercial license. Spec §4 requires permissive licensing.
 * - Custom React SVG — full control but ~400 LOC of drag/resize/arrow code in
 *   a single session. Higher implementation risk; no test coverage for drag.
 * - `frappe-gantt` — native drag-to-move AND drag-to-resize, finish-to-start
 *   dependency arrows built in, milestone rendering when start==end, today
 *   highlight via CSS variable, CSS hooks for per-task `custom_class` (used
 *   below for critical-path red + phase-tinted bars), MIT license.
 *
 * Trade-offs accepted:
 * - No native swim-lane rendering; we approximate with phase-tinted bars and
 *   a sort-by-phase ordering (Chris flagged full swim lanes as a polish item).
 * - Library is a vanilla JS class, not a React component — we wrap with
 *   useRef/useEffect and rebuild the chart when inputs change.
 * - No TypeScript types shipped; we use a narrow local type for the
 *   constructor so the rest of the app stays type-safe.
 */

import { useEffect, useRef } from "react";
import "./frappe-gantt.css";
import "./gantt.css";
import type { TaskStatus } from "@/lib/status";

export type GanttTaskInput = {
  id: string;
  wbs: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  progress: number; // 0–100
  phase: string | null;
  is_milestone: boolean;
  is_critical: boolean;
  status: TaskStatus;
  dependencies: string[]; // predecessor ids
};

type GanttCtor = new (
  wrapper: HTMLElement,
  tasks: Record<string, unknown>[],
  options: Record<string, unknown>,
) => {
  refresh?: (tasks: Record<string, unknown>[]) => void;
};

export type UserMode = "cme_admin" | "read_only";

export function GanttChart({
  tasks,
  mode,
  onTaskClick,
  onTaskDrag,
  viewMode = "Week",
}: {
  tasks: GanttTaskInput[];
  mode: UserMode;
  onTaskClick: (taskId: string) => void;
  onTaskDrag?: (
    taskId: string,
    newStart: string,
    newFinish: string,
  ) => void;
  viewMode?: "Day" | "Week" | "Month" | "Quarter" | "Year";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<{
    refresh?: (tasks: Record<string, unknown>[]) => void;
  } | null>(null);
  const clickHandlerRef = useRef(onTaskClick);
  const dragHandlerRef = useRef(onTaskDrag);

  // Keep refs in sync so the frappe-gantt instance (which captures these on
  // mount) always calls the latest handler even if the parent re-renders.
  useEffect(() => {
    clickHandlerRef.current = onTaskClick;
    dragHandlerRef.current = onTaskDrag;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const libTasks = tasks.map((t) => ({
      id: t.id,
      name: `${t.wbs} · ${t.name}`,
      start: t.start,
      end: t.end,
      progress: t.progress,
      dependencies: t.dependencies.join(","),
      custom_class: [
        phaseClass(t.phase),
        t.is_critical ? "is-critical" : "",
        t.is_milestone ? "is-milestone" : "",
      ]
        .filter(Boolean)
        .join(" "),
    }));

    (async () => {
      const mod = (await import("frappe-gantt")) as unknown as {
        default: GanttCtor;
      };
      if (cancelled || !containerRef.current) return;

      // Clear any prior render (strict-mode double-invoke in dev, view_mode
      // changes, etc.)
      containerRef.current.innerHTML = "";

      const Gantt = mod.default;
      const gantt = new Gantt(containerRef.current, libTasks, {
        view_mode: viewMode,
        readonly: mode !== "cme_admin",
        readonly_progress: true,
        container_height: "auto",
        bar_height: 24,
        padding: 12,
        scroll_to: "today",
        today_button: false,
        popup: ({
          task,
          set_title,
          set_details,
          chart,
        }: {
          task: { name: string; start: Date; end: Date };
          set_title: (html: string) => void;
          set_details: (html: string) => void;
          chart: { close_popup: () => void };
        }) => {
          set_title(task.name);
          set_details(
            `${formatDate(task.start)} → ${formatDate(task.end)}`,
          );
          void chart;
        },
        on_click: (task: { id: string }) => {
          clickHandlerRef.current(task.id);
        },
        on_date_change: (
          task: { id: string },
          start: Date,
          end: Date,
        ) => {
          const handler = dragHandlerRef.current;
          if (!handler) return;
          handler(
            task.id,
            isoDay(start),
            isoDay(end),
          );
        },
      });
      ganttRef.current = gantt;
    })();

    return () => {
      cancelled = true;
    };
    // Re-init on any task list change. Drag and click handlers are captured
    // via refs so they don't force remounts.
  }, [tasks, mode, viewMode]);

  return <div ref={containerRef} className="cme-gantt" />;
}

function phaseClass(phase: string | null): string {
  if (!phase) return "";
  if (phase === "1.5") return "phase-1-5";
  if (phase === "PM") return "phase-pm";
  return `phase-${phase}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
